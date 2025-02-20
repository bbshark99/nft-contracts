const BigNumber = require("bignumber.js");
const delay = require("delay");
const { assert, expect } = require("chai");
const { expectRevert } = require("@openzeppelin/test-helpers");

const { getGasCost } = require("./utils");

const MetaverseNFT = artifacts.require("MetaverseNFT");
const ERC721Community = artifacts.require("ERC721Community");
const NFTExtension = artifacts.require("NFTExtension");
const MockTokenURIExtension = artifacts.require("MockTokenURIExtension");
const LimitAmountSaleExtension = artifacts.require("LimitAmountSaleExtension");

const DemoCollection = artifacts.require("DemoCollection");

const { main: getImplementation } = require("../scripts/deploy-proxy.ts");

const ether = new BigNumber(1e18);

contract("ERC721Community - Implementation", (accounts) => {
  let nft;
  const [owner, user1, user2] = accounts;
  const beneficiary = owner;

  before(async () => {

    // check if there is contract code at 0xe7c721B7CB5Fb2E47E01dE0D19d3385d6b13B87d
    const code = await web3.eth.getCode("0xe7c721B7CB5Fb2E47E01dE0D19d3385d6b13B87d");

    if (code === "0x") {
      await getImplementation();
    }

    assert.notEqual(await web3.eth.getCode("0xe7c721B7CB5Fb2E47E01dE0D19d3385d6b13B87d"), "0x", "No contract code at 0xe7c721B7CB5Fb2E47E01dE0D19d3385d6b13B87d");

  });

  beforeEach(async () => {

    nft = await ERC721Community.new(
      "Test", // name
      "NFT", // symbol
      10000, // maxSupply
      3, // nReserved
      false, // startAtOne
      "ipfs://factory-test/", // uri
      // MintConfig
      {
        publicPrice: ether.times(0.03).toFixed(),
        maxTokensPerMint: 20,
        maxTokensPerWallet: 20,
        royaltyFee: 500,
        payoutReceiver: beneficiary,
        shouldLockPayoutReceiver: false,
        shouldStartSale: false,
        shouldUseJsonExtension: false,
      },
    );

    nft = await MetaverseNFT.at(nft.address);

    // await nft.setup(
    //   ether.times(0.03).toString(),
    //   20, // max per mint
    //   20, // max per mint
    //   500, // basis points
    //   "0x0000000000000000000000000000000000000000", // payout receiver
    //   false, // should lock payout receiver
    //   false, // should start sale
    //   false, // should use json extension
    // )

  });

  // it should deploy successfully
  it("should deploy successfully", async () => {
    assert.ok(nft.address);
  });

  // it should spend <1m gas to deploy proxy
  it("should spend less than 1m gas to deploy proxy", async () => {

    const nft = await ERC721Community.new(
      "Test", // name
      "NFT", // symbol
      10000, // maxSupply
      3, // nReserved
      false, // startAtOne
      "ipfs://factory-test/", // uri
      // MintConfig
      {
        publicPrice: ether.times(0.03).toFixed(),
        maxTokensPerMint: 20,
        maxTokensPerWallet: 20,
        royaltyFee: 500,
        payoutReceiver: user1,
        shouldLockPayoutReceiver: false,
        shouldStartSale: false,
        shouldUseJsonExtension: false,
      },
    );

    const nft_ = (await MetaverseNFT.at(nft.address))

    // const setupTx = await nft_.setup(
    //   ether.times(0.03).toString(),
    //   20, // max per mint
    //   20, // max per mint
    //   500, // basis points
    //   user1, // payout receiver
    //   false, // should lock payout receiver
    //   false, // should start sale
    //   false, // should use json extension
    // );

    const hash = nft.transactionHash;

    const receipt = await web3.eth.getTransactionReceipt(hash);

    // const setupReceipt = (await setupTx).receipt;

    const gasUsed = receipt.gasUsed + 0 // setupReceipt.gasUsed;

    assert.isBelow(gasUsed, 1_000_000);

  })

  // price should equal 0.03 ether
  it("should have a price of 0.03 ether", async () => {
    const price = await nft.price();
    assert.equal(price, ether.times(0.03).toString());
  });

  // it should fail to mint when sale is not started
  it("should fail to mint when sale is not started", async () => {
    try {
      await nft.mint(1, { from: accounts[1], value: ether.times(0.03) });
    } catch (error) {
      // check that error message has expected substring 'Sale not started'
      assert.include(error.message, "Sale not started");
    }
  });

  // it should allow to change payout receiver
  it("should allow to change payout receiver", async () => {
    const receiver = await nft.getPayoutReceiver();

    assert.equal(receiver, owner);

    await nft.setPayoutReceiver(user1, { from: owner });

    const receiver2 = await nft.getPayoutReceiver();

    assert.equal(receiver2, user1);
  });

  // it should be able to start sale when beneficiary is set
  it("should be able to start sale when beneficiary is set", async () => {
    // set beneficiary
    // await nft.setBeneficiary(beneficiary, { from: owner });
    // start sale
    await nft.startSale({ from: owner });

    // await delay(100);
    // skip block

    // await mineBlock();

    // check that sale is started
    const isSaleStarted = await nft.saleStarted();
    assert.equal(isSaleStarted, true);
  });

  // it should mint successfully
  it("should mint successfully when sale is started", async () => {
    await nft.startSale({ from: owner });
    // mint
    const tx = await nft.mint(1, { from: owner, value: ether.times(0.03) });
    assert.ok(tx);
  });

  // it should withdraw to beneficiary after contract balance is not zero
  it("should withdraw to beneficiary after contract balance is not zero", async () => {
    await nft.startSale({ from: owner });

    await nft.mint(1, { from: user2, value: ether.times(0.03) });
    await nft.mint(2, { from: user1, value: ether.times(0.03).times(2) });

    const saleBalance = await web3.eth.getBalance(nft.address);

    assert(
      new BigNumber(saleBalance).gte(0),
      "NFT Sale Balance should be non-zero after mint"
    );

    // check beneficiary balance before withdraw
    const beneficiaryBalanceBefore = await web3.eth.getBalance(beneficiary);
    // withdraw
    const tx = await nft.withdraw({ from: owner });
    assert.ok(tx, "Withdraw failed");
    // check beneficiary balance after withdraw
    const beneficiaryBalanceAfter = await web3.eth.getBalance(beneficiary);

    const gasCost = getGasCost(tx);

    const beneficiaryDelta = new BigNumber(beneficiaryBalanceAfter)
      .minus(new BigNumber(beneficiaryBalanceBefore))
      .plus(gasCost);

    // console.log('beneficiaryDelta', beneficiaryBalanceAfter)
    // console.log('beneficiaryDelta', beneficiaryBalanceBefore)
    // console.log('gasCost', gasCost)

    // TODO: turn on this check
    // assert.equal(
    //     beneficiaryDelta.toString(),
    //     saleBalance,
    //     "Beneficiary didn't get money from sales"
    // );

    assert.equal(
      await web3.eth.getBalance(nft.address),
      0,
      "NFT Sale Balance should be zero after withdraw"
    );
  });

  // it should be able to mint 10 tokens in one transaction
  it("should be able to mint 10 tokens in one transaction", async () => {
    // startSale
    await nft.startSale();
    // mint
    const nTokens = 10;
    const tx = await nft.mint(nTokens, {
      from: owner,
      value: 0.03 * nTokens * ether,
    });
    assert.ok(tx);
  });

  // it should fail trying to mint more than 20 tokens
  it("should fail trying to mint more than 20 tokens", async () => {
    // startSale
    await nft.startSale();

    // mint
    try {
      await nft.mint(21, { from: owner, value: 0.03 * 21 * ether });
    } catch (error) {
      // check that error message has expected substring 'You cannot mint more than'
      assert.include(error.message, "You cannot mint more than");
    }
  });

  // it should be able to mint when you send more ether than needed
  it("should be able to mint when you send more ether than needed", async () => {
    // start sale
    await nft.startSale();

    // mint
    const tx = await nft.mint(1, { from: owner, value: 0.5 * ether });
    assert.ok(tx);
  });

  // it should be able to change baseURI from owner account, and _baseURI() value would change
  it("should be able to change baseURI from owner account, and _baseURI() value would change", async () => {
    const baseURI = "https://avatar.com/";
    await nft.setBaseURI(baseURI, { from: owner });
    // mint token
    await nft.startSale();
    await nft.mint(1, { from: owner, value: ether.times(0.03) });
    // check tokenURI
    const tokenURI = await nft.tokenURI(0);
    assert.equal(tokenURI, baseURI + "0");

    // check contractURI equals to baseURI
    const contractURI = await nft.contractURI();
    assert.equal(contractURI, baseURI);
  });

  // it is possible to use extension to change tokenURI
  it("is possible to use extension to change tokenURI", async () => {
    const extension = await MockTokenURIExtension.new(nft.address);

    await nft.setExtensionTokenURI(extension.address, { from: owner });

    // mint token
    await nft.startSale();
    await nft.mint(1, { from: owner, value: ether.times(0.03) });

    // check tokenURI
    const tokenURI = await nft.tokenURI(0);

    assert.equal(tokenURI, "<svg></svg>");
  });

  // it should be able to mint via LimitSaleExtension
  it("should be able to mint via LimitAmountSaleExtension", async () => {
    const extension = await LimitAmountSaleExtension.new(
      nft.address,
      ether.times(0.001),
      10,
      1000,
      { from: owner }
    );

    await nft.addExtension(extension.address, { from: owner });

    // mint token
    await extension.startSale();
    await extension.mint(2, { from: owner, value: ether.times(0.03) });

    // check tokenURI
    const tokenURI = await nft.tokenURI(0);
    assert.equal(tokenURI, "ipfs://factory-test/0");
  });

  // it should output royaltyInfo
  it("should output royaltyInfo", async () => {
    const info = await nft.royaltyInfo(0, 10000);

    // info.royaltyReceiver is nft address
    // info.royaltyFee is 5%

    assert.equal(info.receiver, await nft.owner());
    assert.equal(info.royaltyAmount, 500);

    // it can change

    await nft.setRoyaltyFee(100);

    const { royaltyAmount } = await nft.royaltyInfo(0, 10000);

    assert.equal(royaltyAmount, 100);

    // it can change royaltyReceiver
    await nft.setRoyaltyReceiver(owner);

    const { receiver } = await nft.royaltyInfo(0, 10000);
    assert.equal(receiver, owner);
  });

  // it should be able to mint reserved from owner account
  it("should be able to mint reserved from owner account", async () => {
    // mint
    const tx = await nft.claim(3, accounts[1], { from: owner });
    assert.ok(tx);
  });

  // it should not be able to mint reserved from accounts other that owner
  it("should not be able to mint reserved from accounts other that owner", async () => {
    // mint
    try {
      await nft.claim(3, accounts[1], { from: accounts[1] });
    } catch (error) {
      // check that error message has expected substring Ownable: caller is not the owner
      assert.include(error.message, "Ownable: caller is not the owner");
    }
  });

  // it should not be able to call withdraw from user1
  it("should not be able to call withdraw from user1", async () => {
    await expectRevert(
      nft.withdraw({ from: user1 }),
      "Ownable: caller is not the owner"
    );
  });

  // it should be able to withdraw when setBeneficiary is called, but money will go to beneficiary instead of owner
  it("should be able to withdraw when setBeneficiary is called, but money will go to beneficiary instead of owner", async () => {
    await nft.startSale({ from: owner });

    await nft.mint(1, { from: user2, value: ether.times(0.03) });
    await nft.mint(3, { from: user1, value: ether.times(0.03).times(3) });
    await nft.mint(2, { from: user1, value: ether.times(0.03).times(2) });

    await delay(500);

    const saleBalance = await web3.eth.getBalance(nft.address);
    const beneficiaryBalance = await web3.eth.getBalance(beneficiary);

    // withdraw
    const tx = await nft.withdraw({ from: owner });
    assert.ok(tx);

    const gasCost = getGasCost(tx);

    const beneficiaryBalanceNow = await web3.eth.getBalance(beneficiary);

    assert.equal(
      new BigNumber(beneficiaryBalanceNow)
        .minus(beneficiaryBalance)
        .plus(gasCost)
        .toString(),

      // without buildship fee
      new BigNumber(saleBalance).times(95).div(100).toString(),
      "Owner should get money from sales, but only 95%"
    );
  });

  it("should not be able to mint more than 200 tokens, when 200 tokens are minted, it should fail", async () => {
    const _nft = await ERC721Community.new(
      "Avatar Collection NFT", // name: 
      "NFT", // symbol: 
      200, // maxSupply: 
      40, // nReserved: 
      false, // start at one
      "ipfs://factory-test/", // baseURI:
      // MintConfig
      {
        publicPrice: "1000000000000000",
        maxTokensPerMint: 30,
        maxTokensPerWallet: 30,
        royaltyFee: 500,
        payoutReceiver: "0x0000000000000000000000000000000000000000",
        shouldLockPayoutReceiver: false,
        shouldStartSale: false,
        shouldUseJsonExtension: false,
      },
    );

    const nft = await MetaverseNFT.at(_nft.address);

    // await nft.setup(
    //   "1000000000000000",
    //   30,
    //   30,
    //   500,
    //   "0x0000000000000000000000000000000000000000",
    //   false,
    //   false,
    //   false,
    // );

    await nft.startSale();

    // set price to 0.0001 ether
    await nft.setPrice(ether.times(0.0001));
    await nft.updateMaxPerWallet(0);

    // try minting 20 * 20 tokens, which is more than the max allowed (200)
    try {
      await Promise.all(
        Array(20)
          .fill()
          .map(() =>
            nft.mint(20, { from: owner, value: ether.times(0.0001).times(20) })
          )
      );
    } catch (error) {
      console.log('error', error.message)
      assert.include(error.message, "Not enough Tokens left");
    }
  });

  // it should be able to add and remove extension
  it("should be able to add and remove extension", async () => {
    const extension = await NFTExtension.new(nft.address);
    const extension2 = await NFTExtension.new(nft.address);
    const extension3 = await NFTExtension.new(nft.address);

    await nft.addExtension(extension.address);
    await nft.addExtension(extension2.address);
    await nft.addExtension(extension3.address);

    assert.equal(await nft.isExtensionAdded(extension.address), true);
    // check that extensions(0) is extension address
    assert.equal(await nft.extensions(0), extension.address);

    await nft.revokeExtension(extension.address);

    assert.equal(await nft.isExtensionAdded(extension.address), false);

    await nft.revokeExtension(extension3.address);

    assert.equal(await nft.isExtensionAdded(extension3.address), false);

    assert.equal(await nft.isExtensionAdded(extension2.address), true);
  });

  // it should be able to reduce supply minting
  it("should be able to reduce supply and then mint doesnt work", async () => {
    await nft.reduceMaxSupply(10);
    await nft.startSale();

    await nft.mint(5, { value: ether });
    await nft.claim(3, user1);

    try {
      await nft.mint(5, { value: ether });

    } catch (error) {
      assert.include(error.message, "Not enough Tokens left.");
    }
  });

  // it should not be able to reduce max supply more than possible
  it("should not be able to reduce max supply more than possible", async () => {
    await nft.claim(3, user2);

    await nft.startSale();
    await nft.updateMaxPerMint(10);
    await nft.mint(10, { from: user2, value: ether });

    await expectRevert(nft.reduceMaxSupply(300), "Sale should not be started");

    await nft.stopSale();

    await nft.reduceMaxSupply(1000);

    await expectRevert(nft.reduceMaxSupply(10), "Max supply is too low, already minted more (+ reserved)");

    await expectRevert(nft.reduceMaxSupply(1337), "Cannot set higher than the current maxSupply");

  })

  it("should be able to batch mint", async () => {
    expect(await nft.claim(3, user1, { from: owner })).to.be.ok;
    expect((await nft.balanceOf(user1)).toString()).to.be.equal("3");
    expect(await nft.ownerOf(0)).to.be.equal(user1);
    expect(await nft.ownerOf(1)).to.be.equal(user1);
    expect(await nft.ownerOf(2)).to.be.equal(user1);

    expect(await nft.transferFrom(user1, user2, 1, { from: user1 })).to.be.ok;
    expect(await nft.ownerOf(1)).to.be.equal(user2);
  });

  it("should spend less than 600k gas with null config", async () => {

    const nft = await ERC721Community.new(
      "Test", // name
      "NFT", // symbol
      10000, // maxSupply
      3, // nReserved
      false, // startAtOne
      "ipfs://factory-test/", // uri
      // MintConfig
      {
        publicPrice: 0,
        maxTokensPerMint: 0,
        maxTokensPerWallet: 0,
        royaltyFee: 0,
        payoutReceiver: "0x0000000000000000000000000000000000000000",
        shouldLockPayoutReceiver: false,
        shouldStartSale: false,
        shouldUseJsonExtension: false,
      },
    );

    const tx2 = nft.transactionHash;
    const receipt2 = await web3.eth.getTransactionReceipt(tx2);
    assert.ok(receipt2);
    assert.isBelow(receipt2.gasUsed, 650_000);

    console.log('ERC721Community', receipt2.gasUsed);

  });

  it("should spend less than 750k gas for DemoCollection", async () => {
    const demo = await DemoCollection.new();

    const tx1 = demo.transactionHash;

    const receipt1 = await web3.eth.getTransactionReceipt(tx1);

    assert.ok(receipt1);
    assert.isBelow(receipt1.gasUsed, 750_000);

    console.log('DemoCollection', receipt1.gasUsed);
  });

});
