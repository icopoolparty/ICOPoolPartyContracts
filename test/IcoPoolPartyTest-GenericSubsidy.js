import expectThrow from './helpers/expectThrow';
import {
    smartLog,
    sleep,
    calculateSubsidy,
    Status,
    Contributions,
    KickReason,
    DUE_DILIGENCE_DURATION,
    ParticipantStruct,
    genericTokenArtifact,
    customSaleArtifact,
    poolPartyArtifact,
    poolPartyFactoryArtifact,
    mockNameServiceArtifact
} from './helpers/utils';

let poolPartyFactory;
let poolParty;
let customSale;
let genericToken;
let mockNameService;

contract('Generic Pool Party ICO', function (accounts) {

    describe('Generic Sale', function () {
        this.slow(5000);

        const [_deployer, _investor1, _investor2, _investor3] = accounts;

        before(async () => {
            mockNameService = await mockNameServiceArtifact.new();
            await mockNameService.__callback(web3.sha3("api.test.foreground.io"), accounts[7].toString(), 0x42);

            poolPartyFactory = await poolPartyFactoryArtifact.new(_deployer, mockNameService.address, {from: _deployer});
            smartLog("Pool Party Factory Address [" + await poolPartyFactory.address + "]");
            await poolPartyFactory.setDueDiligenceDuration(DUE_DILIGENCE_DURATION/1000);
            genericToken = await genericTokenArtifact.deployed();
            customSale = await customSaleArtifact.deployed();
        });

        it("should create new Pool Party", async () => {
            await poolPartyFactory.createNewPoolParty("api.test.foreground.io", "Pool name", "Pool description", web3.toWei("15"), web3.toWei("0.5"), web3.toWei("0.8"), "QmNd7C8BwUqfhfq6xyRRMzxk1v3dALQjDxwBg4yEJkU24D", {from: _deployer});
            poolParty = poolPartyArtifact.at(await poolPartyFactory.poolAddresses(0));
        });

        it("should add funds to pool", async () => {
            await poolParty.addFundsToPool(12, {from: _investor1, value: web3.toWei("6", "ether")});

            let investmentAmount = (await poolParty.participants(_investor1))[ParticipantStruct.amountContributed];
            let totalInvested = await poolParty.totalPoolContributions();
            assert.equal(investmentAmount, web3.toWei("6", "ether"), "Incorrect balance");
            assert.equal(totalInvested, web3.toWei("6", "ether"), "Incorrect total");
        });

        it("should withdraw funds from pool", async () => {
            await poolParty.leavePool({from: _investor1});
            let investmentAmount = (await poolParty.participants(_investor1))[ParticipantStruct.amountContributed];
            assert.equal(investmentAmount, 0, "Incorrect balance");

            let totalInvested = await poolParty.totalPoolContributions();
            assert.equal(totalInvested, web3.toWei("0", "ether"), "Incorrect total");
        });

        it("Should add more funds to pool", async () => {
            await poolParty.addFundsToPool(13, {from: _investor1, value: web3.toWei("6.5", "ether")});
            let investmentAmount = (await poolParty.participants(_investor1))[ParticipantStruct.amountContributed];
            let totalInvested = await poolParty.totalPoolContributions();

            assert.equal(investmentAmount, web3.toWei("6.5", "ether"), "Incorrect balance");
            assert.equal(totalInvested, web3.toWei("6.5", "ether"), "Incorrect total");

            await poolParty.addFundsToPool(18, {from: _investor2, value: web3.toWei("9", "ether")});
            let investmentAmount2 = (await poolParty.participants(_investor2))[ParticipantStruct.amountContributed];
            totalInvested = await poolParty.totalPoolContributions();

            assert.equal(investmentAmount2, web3.toWei("9", "ether"), "Incorrect balance");
            assert.equal(totalInvested, web3.toWei("15.5", "ether"), "Incorrect total");
        });

        it("should configure pool details", async () => {
            await poolParty.configurePool(customSale.address, genericToken.address, "buy()", "N/A", "refund()", true, "www.vendor.com/ppcommunication", {from: accounts[7]});
            assert.equal(await poolParty.buyFunctionName(), "buy()", "Wrong buyFunctionName");
            //await poolParty.addFundsToPool(2, {from: _investor3, value: web3.toWei("1")});
        });

        it("should complete configuration", async () => {
            await poolParty.completeConfiguration({from: accounts[7]});
            const poolState = await poolParty.poolStatus();
            assert.equal(poolState, Status.DueDiligence, "Pool in incorrect status");
        });

        /*it.skip("Should kick user", async () => {
            //Expect throw because of wrong state
            await expectThrow(poolParty.kickUser(_investor3, KickReason.Other, {from: accounts[7]}));
            await sleep(3000);
            await poolParty.kickUser(_investor3, KickReason.Other, {from: accounts[7]});
            smartLog("Account 3 eth after being kicked [" + web3.fromWei((await poolParty.participants(_investor3))[ParticipantStruct.amountContributed]) + "]");
            assert.equal((await poolParty.participants(_investor3))[ParticipantStruct.amountContributed], 0, "User account should be 0");
            smartLog("Total investment amount [" + web3.fromWei(await poolParty.totalPoolContributions()) + "]");
            //assert.equal(await poolParty.totalPoolContributions(), web3.toWei("11.03123123", "ether"), "Total investments should be 11 eth");
        });*/

        it("Should release funds to ICO", async () => {
            await sleep(3500);

            await poolParty.startInReviewPeriod({from: accounts[7]});

            smartLog("Sale Contract Balance BEFORE [" + web3.fromWei(web3.eth.getBalance(customSale.address)) + "]");
            smartLog("Pool Contract Balance BEFORE [" + web3.fromWei(web3.eth.getBalance(poolParty.address)) + "]");
            const poolState = await poolParty.poolStatus();
            smartLog("Pool State should be 3 [" + poolState + "]");
            smartLog("Total pool investments [" + web3.fromWei(await poolParty.totalPoolContributions()) + "]");
            //smartLog("Hashed Buy FN Name [" + await poolParty.hashedBuyFunctionName() + "]");

            const subsidy = calculateSubsidy(await poolParty.discountPercent(), await poolParty.totalPoolContributions());
            smartLog("Subsidy is [" + web3.fromWei(subsidy) + "]");

            const feePercent = await poolParty.feePercentage();
            const total = await poolParty.totalPoolContributions();
            const fee = total * feePercent / 100;
            smartLog("Fee [" + web3.fromWei(fee) + "]");

            //Send too little as the subsidy - should fail
            await expectThrow(poolParty.releaseFundsToSale({
                from: accounts[7],
                value: subsidy - 1*10**16,
                gas: 300000
            }));

            await poolParty.releaseFundsToSale({
                from: accounts[7],
                value: subsidy + fee,
                gas: 300000
            });

            smartLog("Sale Contract Balance AFTER [" + web3.fromWei(web3.eth.getBalance(customSale.address)) + "]");
            smartLog("Pool Contract Balance AFTER [" + web3.fromWei(web3.eth.getBalance(poolParty.address)) + "]");

            const tokensDue0 = (await poolParty.getContributionsDue(_investor1))[Contributions.tokensDue];
            smartLog("Account 0 has [" + tokensDue0 + "] tokens due");

        });

        it("Should claim tokens from ICO", async () => {
            smartLog("Tokens Received [" + await poolParty.poolTokenBalance() + "]");
            smartLog("Pool Party token balance [" + await genericToken.balanceOf(poolParty.address) + "]");
        });

        it("Should get correct tokens due balance", async () => {
            const tokensDue0 = (await poolParty.getContributionsDue(_investor1))[Contributions.tokensDue];
            smartLog("Account 0 has [" + tokensDue0 + "] tokens due");
            assert.isAbove(tokensDue0, 0, "Account 0 should have more than 0 tokens");

            const tokensDue1 = (await poolParty.getContributionsDue(_investor2))[Contributions.tokensDue];
            smartLog("Account 1 has [" + tokensDue1 + "] tokens due");
            assert.isAbove(tokensDue0, 0, "Account 1 should have more than 0 tokens");
        });

        it("Should claim tokens", async () => {
            smartLog("Token Decimals [" + await genericToken.decimals() + "]");
            smartLog("Total tokens received from sale [" + await poolParty.poolTokenBalance() + "]");
            smartLog("Account 0 eth investment [" + web3.fromWei((await poolParty.participants(_investor1))[ParticipantStruct.amountContributed]) + "]");

            await poolParty.claimTokens({from: _investor1});
            smartLog("Account 0 token balance [" + await genericToken.balanceOf(_investor1) + "]");
            assert.isAbove(await genericToken.balanceOf(_investor1), 0, "Token balance must be greater than 0");

            await poolParty.claimTokens({from: _investor2});
            smartLog("Account 1 token balance [" + await genericToken.balanceOf(_investor2) + "]");
            assert.isAbove(await genericToken.balanceOf(_investor2), 0, "Token balance must be greater than 0");

            smartLog("Pool Party token balance after everyone claims [" + await genericToken.balanceOf(poolParty.address) + "]");

            smartLog("Account 0 has [" + (await poolParty.getContributionsDue(_investor1))[Contributions.tokensDue] + "] tokens due after claim");
            smartLog("Account 1 has [" + (await poolParty.getContributionsDue(_investor2))[Contributions.tokensDue] + "] tokens due after claim");

            smartLog("Account 0 Contribution percentage [" + (await poolParty.participants(_investor1))[ParticipantStruct.percentageContribution] + "]");
            smartLog("Account 1 Contribution percentage [" + (await poolParty.participants(_investor2))[ParticipantStruct.percentageContribution] + "]");

            smartLog("Balance remaining Snapshot [" + web3.fromWei(await poolParty.balanceRemainingSnapshot()) + "]");

            smartLog("Account 0 amount back [" + web3.fromWei((await poolParty.participants(_investor1))[ParticipantStruct.refundAmount]) + "]");
            smartLog("Account 1 amount back [" + web3.fromWei((await poolParty.participants(_investor2))[ParticipantStruct.refundAmount]) + "]");
        });
    });
});
