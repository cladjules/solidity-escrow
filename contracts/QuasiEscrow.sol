// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title QuasiEscrow
 */
contract QuasiEscrow is ReentrancyGuard, Ownable {
  using Address for address payable;
  using SafeMath for uint256;

  mapping(address => Deposit) private _deposits;

  // packed struct for storage optimization
  struct Deposit {
    // 1st slot
    address payee; // 160/256 bits
    uint96 timePeriod; // 256/256 bits - in seconds
    // 2nd slot
    uint64 date; // timestamp
    uint64 periodAmount; // in wei per period elapsed
    uint64 totalAmount; // in wei
    uint64 withdrawnAmount; // The total amount withdrawn so far
  }

  event Deposited(address indexed payee, uint256 amount);
  event Withdrawn(address indexed payee, uint256 amount);

  /**
   * @notice Returns the details regarding the deposit, restricted to owner only
   * @param payee The destination address of the funds.
   */
  function depositOf(
    address payee
  ) external view onlyOwner returns (Deposit memory) {
    return _deposits[payee];
  }

  /**
   * @notice Stores the details regarding the deposit
   * @param payee The destination address of the funds.
   * @param timePeriod The timePeriod in seconds for a single withdraw to be allowed
   * @param periodAmount The amount of coins that can be withdran per period
   *
   * Emits a {Deposited} event.
   */
  function deposit(
    address payee,
    uint96 timePeriod,
    uint64 periodAmount
  ) external payable nonReentrant {
    uint64 amount = uint64(msg.value);

    require(amount > 0, "Amount should be greater than zero");

    require(
      _deposits[payee].totalAmount <= 0,
      "There are already funds deposited for this payee"
    );

    _deposits[payee] = Deposit(
      payee,
      timePeriod,
      uint64(block.timestamp),
      periodAmount,
      amount,
      0
    );

    emit Deposited(payee, amount);
  }

  /**
   * @notice Withdraw accumulated balance for a payee, forwarding all gas to the recipient.
   * @param amount The amount to be withdrawn.
   *
   * Emits a {Withdrawn} event.
   */
  function withdraw(uint64 amount) external nonReentrant {
    Deposit memory payeeDeposit = _deposits[msg.sender];
    uint64 withdrawnAmount = payeeDeposit.withdrawnAmount;

    require(
      payeeDeposit.totalAmount > 0,
      "No funds deposited for this address"
    );

    require(amount > 0, "Amount should be greater than zero");

    // SafeMath is good, but increases gas cost, it's a tradeoff to discuss if needed
    uint256 amountAvailable = (block.timestamp.sub(payeeDeposit.date))
      .div(payeeDeposit.timePeriod)
      .mul(payeeDeposit.periodAmount)
      .sub(payeeDeposit.withdrawnAmount);

    require(amountAvailable > 0, "No funds available for withdrawal");
    require(amountAvailable >= amount, "Amount is greater than available");

    withdrawnAmount += amount;

    if (withdrawnAmount == payeeDeposit.totalAmount) {
      delete _deposits[payeeDeposit.payee];
    } else {
      _deposits[msg.sender].withdrawnAmount = withdrawnAmount;
    }

    payable(msg.sender).sendValue(amount);

    emit Withdrawn(payeeDeposit.payee, amount);
  }
}
