const chai = require("chai");
const { expect } = chai;
const { utils } = require("ethers");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { assert } = require("chai");

const dayInSeconds = 86400;
const depositAmount = utils.parseEther("10");

describe("QuasiEscrow", function () {
  let QuasiEscrowContract;

  beforeEach(async function () {
    const QuasiEscrowContractFactory = await hre.ethers.getContractFactory(
      "QuasiEscrow"
    );

    QuasiEscrowContract = await QuasiEscrowContractFactory.deploy();
    await QuasiEscrowContract.deployed();
    expect(QuasiEscrowContract).to.not.equal(undefined);
  });

  const createDeposit = async () => {
    const [_, user1, user2] = await ethers.getSigners();

    const balanceBefore = await QuasiEscrowContract.provider.getBalance(
      user1.address
    );

    const depositTx = await (
      await QuasiEscrowContract.connect(user1).deposit(
        user2.address,
        3 * dayInSeconds,
        utils.parseEther("2"),
        {
          value: depositAmount,
        }
      )
    ).wait();

    expect(depositTx.events.find((e) => e.event === "Deposited")).not.to.equal(
      undefined
    );

    const gasPrice = depositTx.effectiveGasPrice.mul(
      depositTx.cumulativeGasUsed
    );

    const balanceAfter = await QuasiEscrowContract.provider.getBalance(
      user1.address
    );

    expect(balanceAfter).to.equal(
      balanceBefore.sub(depositAmount).sub(gasPrice)
    );

    const deposit = await QuasiEscrowContract.depositOf(user2.address);

    return deposit;
  };

  it("Should deposit 10 ETH to the Escrow and allow withdrawing 2 ETH every 3 days", async function () {
    const [_, __, user2] = await ethers.getSigners();

    const deposit = await createDeposit();
    expect(deposit.payee).to.equal(user2.address);
    expect(deposit.timePeriod).to.equal(3 * dayInSeconds);
    expect(deposit.periodAmount).to.equal(utils.parseEther("2"));
    expect(deposit.totalAmount).to.equal(depositAmount);
    expect(deposit.withdrawnAmount).to.equal(0);
  });

  it("Should attempt to withdraw 2 ETH with the wrong user and throw an error", async function () {
    const [_, user1] = await ethers.getSigners();

    await createDeposit();

    const withdrawTx = QuasiEscrowContract.connect(user1).withdraw(
      utils.parseEther("2")
    );

    await expect(withdrawTx).to.be.revertedWith(
      "No funds deposited for this address"
    );
  });

  it("Should attempt to withdraw 2 ETH immediately and throw an error", async function () {
    const [_, __, user2] = await ethers.getSigners();

    const deposit = await createDeposit();

    const withdrawTx = QuasiEscrowContract.connect(user2).withdraw(
      utils.parseEther("2")
    );

    await expect(withdrawTx).to.be.revertedWith(
      "No funds available for withdrawal"
    );
  });

  it("Should attempt to withdraw 2 ETH after 3 days and succeed the first time only", async function () {
    const [_, __, user2] = await ethers.getSigners();

    let deposit = await createDeposit();

    await helpers.time.increase(dayInSeconds * 3.1);

    const balanceBefore = await QuasiEscrowContract.provider.getBalance(
      user2.address
    );

    const withdrawTx = await (
      await QuasiEscrowContract.connect(user2).withdraw(utils.parseEther("2"))
    ).wait();

    expect(withdrawTx.events.find((e) => e.event === "Withdrawn")).not.to.equal(
      undefined
    );

    deposit = await QuasiEscrowContract.depositOf(user2.address);
    expect(deposit.withdrawnAmount).to.equal(utils.parseEther("2"));

    const gasPrice = withdrawTx.effectiveGasPrice.mul(
      withdrawTx.cumulativeGasUsed
    );

    const balanceAfter = await QuasiEscrowContract.provider.getBalance(
      user2.address
    );

    expect(balanceAfter).to.equal(
      balanceBefore.add(utils.parseEther("2")).sub(gasPrice)
    );

    const withdraw2Tx = QuasiEscrowContract.connect(user2).withdraw(
      utils.parseEther("2")
    );

    await expect(withdraw2Tx).to.be.revertedWith(
      "No funds available for withdrawal"
    );
  });

  it("Should attempt to withdraw 3.5 ETH after 7 days and succeedy", async function () {
    const [_, __, user2] = await ethers.getSigners();

    let deposit = await createDeposit();

    await helpers.time.increase(dayInSeconds * 7);

    const balanceBefore = await QuasiEscrowContract.provider.getBalance(
      user2.address
    );

    const withdrawTx = await (
      await QuasiEscrowContract.connect(user2).withdraw(utils.parseEther("3.5"))
    ).wait();

    expect(withdrawTx.events.find((e) => e.event === "Withdrawn")).not.to.equal(
      undefined
    );

    const gasPrice = withdrawTx.effectiveGasPrice.mul(
      withdrawTx.cumulativeGasUsed
    );

    deposit = await QuasiEscrowContract.depositOf(user2.address);
    expect(deposit.withdrawnAmount).to.equal(utils.parseEther("3.5"));

    const balanceAfter = await QuasiEscrowContract.provider.getBalance(
      user2.address
    );

    expect(balanceAfter).to.equal(
      balanceBefore.add(utils.parseEther("3.5")).sub(gasPrice)
    );
  });

  it("Should attempt to withdraw 4 ETH after 10 days then 5 ETH, then the remaining balance 20 days later", async function () {
    const [_, __, user2] = await ethers.getSigners();

    let deposit = await createDeposit();

    await helpers.time.increase(dayInSeconds * 10);

    const balanceBefore = await QuasiEscrowContract.provider.getBalance(
      user2.address
    );

    let withdrawTx = await (
      await QuasiEscrowContract.connect(user2).withdraw(utils.parseEther("4"))
    ).wait();

    let gasPrice = withdrawTx.effectiveGasPrice.mul(
      withdrawTx.cumulativeGasUsed
    );

    expect(withdrawTx.events.find((e) => e.event === "Withdrawn")).not.to.equal(
      undefined
    );

    deposit = await QuasiEscrowContract.depositOf(user2.address);
    expect(deposit.withdrawnAmount).to.equal(utils.parseEther("4"));

    await helpers.time.increase(dayInSeconds * 20);

    withdrawTx = await (
      await QuasiEscrowContract.connect(user2).withdraw(utils.parseEther("5"))
    ).wait();

    gasPrice = gasPrice.add(
      withdrawTx.effectiveGasPrice.mul(withdrawTx.cumulativeGasUsed)
    );

    deposit = await QuasiEscrowContract.depositOf(user2.address);
    expect(deposit.withdrawnAmount).to.equal(utils.parseEther("9"));

    withdrawTx = await (
      await QuasiEscrowContract.connect(user2).withdraw(utils.parseEther("1"))
    ).wait();

    gasPrice = gasPrice.add(
      withdrawTx.effectiveGasPrice.mul(withdrawTx.cumulativeGasUsed)
    );

    deposit = await QuasiEscrowContract.depositOf(user2.address);
    // the amount is now 0 since the object has been deleted
    expect(deposit.withdrawnAmount).to.equal(utils.parseEther("0"));

    const balanceAfter = await QuasiEscrowContract.provider.getBalance(
      user2.address
    );

    expect(balanceAfter).to.equal(
      balanceBefore.add(utils.parseEther("10")).sub(gasPrice)
    );
  });
});
