
pragma solidity ^0.8.20;

contract TokenPactEscrow {
    
    struct Task {
        address buyer;
        address provider;
        uint256 bountyAmount;
        bool isLocked;
        bool isSettled;
    }

    mapping(bytes32 => Task) public tasks;

    address public trustedVerifier;

    event TaskFunded(bytes32 indexed taskId, address indexed buyer, uint256 amount);
    event TaskSettled(bytes32 indexed taskId, address indexed provider, uint256 amount, bool passed);
    
    constructor(address _verifier) {
        trustedVerifier = _verifier;
    }

    function lockBounty(bytes32 taskId, address provider) external payable {
        require(msg.value > 0, "Bounty must be > 0");
        require(!tasks[taskId].isLocked, "Task already locked");
        
        tasks[taskId] = Task({
            buyer: msg.sender,
            provider: provider,
            bountyAmount: msg.value,
            isLocked: true,
            isSettled: false
        });

        emit TaskFunded(taskId, msg.sender, msg.value);
    }

    function releaseOnVerification(bytes32 taskId, bool passed, bytes memory signature) external {
        Task storage task = tasks[taskId];
        require(task.isLocked, "Task not funded");
        require(!task.isSettled, "Task already settled");

        bytes32 messageHash = keccak256(abi.encodePacked(taskId, passed));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        address recoveredSigner = recoverSigner(ethSignedMessageHash, signature);
        require(recoveredSigner == trustedVerifier, "Invalid Verifier Signature");

        task.isSettled = true;

        if (passed) {
            
            payable(task.provider).transfer(task.bountyAmount);
            emit TaskSettled(taskId, task.provider, task.bountyAmount, true);
        } else {
            
            payable(task.buyer).transfer(task.bountyAmount);
            emit TaskSettled(taskId, task.buyer, task.bountyAmount, false);
        }
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
