// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AureoCore
 * @notice Registro auditable de operaciones corporativas y alertas de riesgo.
 */
contract AureoCore is AccessControl, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    struct CorporateTransfer {
        address initiator;
        address beneficiary;
        uint256 amount;
        bytes32 operationReference;
        uint256 timestamp;
    }

    struct Alert {
        bytes32 operationReference;
        uint8 riskLevel;
        string reason;
        address initiator;
        uint256 timestamp;
    }

    uint256 private _operationCounter;
    uint256 private _alertCounter;
    mapping(uint256 operationId => CorporateTransfer) private _transfers;
    mapping(uint256 alertId => Alert) private _alerts;

    event CorporateTransferRecorded(
        uint256 indexed operationId,
        address indexed initiator,
        address indexed beneficiary,
        uint256 amount,
        bytes32 operationReference,
        uint256 timestamp
    );
    event AlertStarted(
        uint256 indexed alertId,
        bytes32 indexed operationReference,
        uint8 riskLevel,
        string reason,
        uint256 timestamp
    );
    event CircuitBreakerChanged(address indexed account, bool paused, uint256 timestamp);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidRiskLevel();
    error EmptyReason();
    error UnknownOperation();
    error UnknownAlert();

    constructor(address admin) {
        if (admin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
    }

    function recordCorporateTransfer(
        address beneficiary,
        uint256 amount,
        bytes32 operationReference
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused returns (uint256 operationId) {
        if (beneficiary == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        operationId = ++_operationCounter;
        _transfers[operationId] = CorporateTransfer({
            initiator: _msgSender(),
            beneficiary: beneficiary,
            amount: amount,
            operationReference: operationReference,
            timestamp: block.timestamp
        });
        emit CorporateTransferRecorded(
            operationId,
            _msgSender(),
            beneficiary,
            amount,
            operationReference,
            block.timestamp
        );
    }

    function startAlert(
        bytes32 operationReference,
        uint8 riskLevel,
        string calldata reason
    ) external onlyRole(COMPLIANCE_ROLE) whenNotPaused returns (uint256 alertId) {
        if (bytes(reason).length == 0) revert EmptyReason();
        if (riskLevel == 0 || riskLevel > 4) revert InvalidRiskLevel();

        alertId = ++_alertCounter;
        _alerts[alertId] = Alert({
            operationReference: operationReference,
            riskLevel: riskLevel,
            reason: reason,
            initiator: _msgSender(),
            timestamp: block.timestamp
        });
        emit AlertStarted(alertId, operationReference, riskLevel, reason, block.timestamp);
    }

    function pause() external onlyRole(COMPLIANCE_ROLE) {
        _pause();
        emit CircuitBreakerChanged(_msgSender(), true, block.timestamp);
    }

    function unpause() external onlyRole(COMPLIANCE_ROLE) {
        _unpause();
        emit CircuitBreakerChanged(_msgSender(), false, block.timestamp);
    }

    function operationCounter() external view returns (uint256) {
        return _operationCounter;
    }

    function alertCounter() external view returns (uint256) {
        return _alertCounter;
    }

    function getCorporateTransfer(
        uint256 operationId
    ) external view returns (CorporateTransfer memory transfer) {
        if (operationId == 0 || operationId > _operationCounter) revert UnknownOperation();
        return _transfers[operationId];
    }

    function getAlert(uint256 alertId) external view returns (Alert memory alert) {
        if (alertId == 0 || alertId > _alertCounter) revert UnknownAlert();
        return _alerts[alertId];
    }
}
