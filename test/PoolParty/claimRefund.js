import expectThrow from './../helpers/expectThrow';
import {
    smartLog,
    sleep,
    calculateFee,
    calculateSubsidy,
    Status,
    Contributions,
    ParticipantStruct,
    DUE_DILIGENCE_DURATION,
    customSaleArtifact,
    dealTokenArtifact,
    foregroundTokenSaleArtifact,
    genericTokenArtifact,
    poolPartyArtifact,
    poolPartyFactoryArtifact,
    mockNameServiceArtifact
} from './../helpers/utils';

let foregroundTokenSale;
let dealToken;

let poolPartyFactory;
let poolParty;
let genericToken;
let customSale;
let mockNameService;

contract('PoolParty', (accounts) => {
    const [_deployer, _investor1, _investor2, _saleAddress, _investor3, _nonInvestor, _saleOwner, _investor4, _foregroundSaleAddresses] = accounts;

    beforeEach(async () => {
        mockNameService = await mockNameServiceArtifact.new();
        await mockNameService.__callback(web3.sha3("api.test.foreground.io"), _saleOwner, 0x42);

        poolPartyFactory = await poolPartyFactoryArtifact.new(_deployer, mockNameService.address, {from: _deployer});
        await poolPartyFactory.setDueDiligenceDuration(DUE_DILIGENCE_DURATION/1000);
        await poolPartyFactory.createNewPoolParty("api.test.foreground.io", "Pool name", "Pool description", web3.toWei("1"), web3.toWei("0.04"), web3.toWei("0.05"), "", {from: _investor1});

        poolParty = poolPartyArtifact.at(await poolPartyFactory.poolAddresses(0));

        await poolParty.addFundsToPool(25, {from: _investor4, value: web3.toWei("1")});
        await poolParty.addFundsToPool(38, {from: _investor2, value: web3.toWei("1.52")});
        await poolParty.addFundsToPool(25, {from: _investor3, value: web3.toWei("1")});
    });

    describe('Function: claimRefund() - Generic Sale', () => {
        beforeEach(async () => {
            genericToken = await genericTokenArtifact.new({from: _deployer});
            customSale = await customSaleArtifact.new(web3.toWei("0.05"), genericToken.address, {from: _deployer});
            await genericToken.transferOwnership(customSale.address, {from: _deployer});

            await poolParty.configurePool(customSale.address, genericToken.address, "buy()", "N/A", "refund()", true, "www.vendor.com/ppcommunication", {from: _saleOwner});
            await poolParty.completeConfiguration({from: _saleOwner});
            await sleep(DUE_DILIGENCE_DURATION);
            await poolParty.startInReviewPeriod({from: _saleOwner});
            const subsidy = calculateSubsidy(await poolParty.discountPercent(), await poolParty.totalPoolContributions());
            const fee = calculateFee(await poolParty.feePercentage(), await poolParty.totalPoolContributions());
            await poolParty.releaseFundsToSale({from: _saleOwner, gas: 300000, value: (subsidy + fee)});
            assert.equal(await poolParty.poolStatus(), Status.Claim, "Pool in incorrect status");
            assert.isAbove(await poolParty.poolTokenBalance(), 0, "Should have received tokens");
        });

        it('should claim refund from pool', async () => {
            await poolParty.claimTokens({from: _investor4});
            const investor4PreviousTokensClaimed = (await poolParty.participants(_investor4))[ParticipantStruct.lastAmountTokensClaimed];
            assert.equal((await genericToken.balanceOf(_investor4)).toNumber(), investor4PreviousTokensClaimed.toNumber(), "Incorrect number of tokens received");

            await poolParty.claimTokens({from: _investor2});
            const investor2PreviousTokensClaimed = (await poolParty.participants(_investor2))[ParticipantStruct.lastAmountTokensClaimed];
            assert.equal((await genericToken.balanceOf(_investor2)).toNumber(), investor2PreviousTokensClaimed.toNumber(), "Incorrect number of tokens received");

            await poolParty.claimTokens({from: _investor3});
            const investor3PreviousTokensClaimed = (await poolParty.participants(_investor3))[ParticipantStruct.lastAmountTokensClaimed];
            assert.equal((await genericToken.balanceOf(_investor3)).toNumber(), investor3PreviousTokensClaimed.toNumber(), "Incorrect number of tokens received");
        });

        it('should attempt to claim refund from pool multiple times', async () => {
        });

        it('should attempt to claim refund for user not in the pool', async () => {
        });

        it('should attempt to claim refund in incorrect state', async () => {
        });

    });

    describe('Function: claimRefund() - Foreground Sale', () => {
        beforeEach(async () => {
            foregroundTokenSale = await foregroundTokenSaleArtifact.new(60, 1, web3.toWei(0.05, "ether"), _deployer);
            const tokenSaleStartBlockNumber = web3.eth.blockNumber + 1;
            const tokenSaleEndBlockNumber = tokenSaleStartBlockNumber + 500;
            await foregroundTokenSale.configureSale(tokenSaleStartBlockNumber, tokenSaleEndBlockNumber, _foregroundSaleAddresses, 50, _foregroundSaleAddresses, _foregroundSaleAddresses, _foregroundSaleAddresses, _foregroundSaleAddresses, {from: _deployer});
            dealToken = dealTokenArtifact.at(await foregroundTokenSale.dealToken());

            await poolParty.configurePool(foregroundTokenSale.address, dealToken.address, "N/A", "claimToken()", "claimRefund()", true, "www.vendor.com/ppcommunication", {from: _saleOwner});
            await poolParty.completeConfiguration({from: _saleOwner});
            await sleep(DUE_DILIGENCE_DURATION);
            await poolParty.startInReviewPeriod({from: _saleOwner});
            const subsidy = calculateSubsidy(await poolParty.discountPercent(), await poolParty.totalPoolContributions());
            const fee = calculateFee(await poolParty.feePercentage(), await poolParty.totalPoolContributions());
            await poolParty.releaseFundsToSale({from: _saleOwner, gas: 400000, value: (subsidy + fee)});
            assert.equal(await poolParty.poolStatus(), Status.InReview, "Pool in incorrect status");
        });

        it('should claim refund from pool', async () => {
            await poolParty.claimTokensFromVendor({from: _saleOwner});
            assert.equal(await poolParty.poolStatus(), Status.Claim, "Pool in incorrect status");

            await poolParty.claimTokens({from: _investor4});
            const investor4PreviousTokensClaimed = (await poolParty.participants(_investor4))[ParticipantStruct.lastAmountTokensClaimed];
            assert.equal((await dealToken.balanceOf(_investor4)).toNumber(), investor4PreviousTokensClaimed.toNumber(), "Incorrect number of tokens received 4");

            await poolParty.claimTokens({from: _investor2});
            const investor2PreviousTokensClaimed = (await poolParty.participants(_investor2))[ParticipantStruct.lastAmountTokensClaimed];
            assert.equal((await dealToken.balanceOf(_investor2)).toNumber(), investor2PreviousTokensClaimed.toNumber(), "Incorrect number of tokens received 2");

            await poolParty.claimTokens({from: _investor3});
            const investor3PreviousTokensClaimed = (await poolParty.participants(_investor3))[ParticipantStruct.lastAmountTokensClaimed];
            assert.equal((await dealToken.balanceOf(_investor3)).toNumber(), investor3PreviousTokensClaimed.toNumber(), "Incorrect number of tokens received 3");
        });

        it('should attempt to claim refund from pool multiple times', async () => {
        });

        it('should attempt to claim refund for user not in the pool', async () => {
        });

        it('should attempt to claim refund in incorrect state', async () => {
        });
    });
});

