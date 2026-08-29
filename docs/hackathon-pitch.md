# TokenPact: Hackathon Pitch & Live Demo Script

**Tagline:** "Don't pay for promises. Pay for proof."

## The Pitch (2 Minutes)

**1. The Problem (Status Quo)**
> *"Nowadays, if an autonomous AI agent hires another AI agent to write code or perform a task, it pays per token via a centralized API (like OpenAI).* 
> *But here's the flaw: If the generated code is completely broken and hallucinates, you STILL pay for it. If it's good, you pay for it. You take 100% of the upfront risk for a promise."*

**2. The Solution (TokenPact)**
> *"TokenPact introduces a revolutionary concept: **The Reverse Escrow**.*
> *Instead of paying upfront, the Buyer locks funds in a trustless Smart Contract. The Provider agent spends its own compute to generate the code. Our system then evaluates the code against strict, deterministic, machine-checkable proofs (like unit tests and execution latency).*
> *If the code passes, the Verifier cryptographically signs a 'Pass' receipt, and the Smart Contract automatically releases the funds to the Provider. If it fails, the Buyer gets a 100% refund. The Provider takes the risk, not the Buyer."*

**3. Why it matters**
> *"This completely solves the problem of AI hallucination in B2B agent economies. It enforces accountability through cryptography and code, not trust."*

---

## The Live Demo Script

### Step 1: The UI (Localhost:8402)
- **Action:** Open `http://localhost:8402` and ensure the **"01 — REVERSE ESCROW"** tab is active.
- **Say:** *"Let's see this in action. The Buyer agent has requested a CLI program that calculates the Fibonacci sequence. The criteria is strict: it must compile, pass 18 hidden test cases, and execute within 500ms."*

### Step 2: Running a Good Agent (Honest)
- **Action:** Click **"Run the pact"** under the **Honest** provider.
- **Say:** *"This agent wrote a highly optimized O(n) iterative solution. Watch the terminal. Our verifier sends the code to our **Cloud Sandbox (Piston API)** which supports over 50 languages dynamically. It evaluates the code in real-time."*
- **Highlight:** Point out the green checkmarks. *"It compiled, passed all tests, and ran fast. Our backend generates a cryptographic signature, sending the signal to our Smart Contract to RELEASE the funds to the Provider."*

### Step 3: Running a Bad Agent (Faulty or Slow)
- **Action:** Click **"Run the pact"** under the **Faulty** or **Slow** provider.
- **Say:** *"What if the agent hallucinates? The Faulty agent assumes Fibonacci is just `n+1`. Watch what happens."*
- **Highlight:** Point out the red error. *"The unit tests immediately catch the flaw. The verification fails. The Smart Contract receives a 'Fail' signature and automatically REFUNDS the Buyer. The Buyer lost zero dollars."*

### Step 4: The Smart Contract (The Real Tech)
- **Action:** Open `contracts/TokenPactEscrow.sol` in your code editor.
- **Say:** *"To prove this isn't just a UI trick, here is our actual Solidity Smart Contract. Notice the `releaseOnVerification` function. It uses ECDSA `ecrecover` to cryptographically guarantee that the funds only move if our Cloud Verifier signs the payload. The payment is 100% automatic and mathematically enforced."*

### Step 5: The API Tollbooth (Future Scope / Scaling)
- **Action:** Click the **"02 — API TOLLBOOTH"** tab in the browser.
- **Say:** *"This exact same x402 cryptographic rail scales beyond just code bounties. We've built an API Tollbooth where downstream agents can pay per API call, settling micropayments instantly and automatically."*
- **Action:** Click **"Call API"**.
- **Say:** *"Notice the 402 Payment Required handshake. The agent pays, and the API executes."*

---

## Q&A Defense

**Q: Why not use an LLM to check if the code is good?**
A: *"LLMs hallucinate. You cannot trust an LLM to grade another LLM, especially when money is involved. We use deterministic, machine-checkable proofs (Unit tests, execution speed, schema validation) which are 100% mathematically sound."*

**Q: Are you really executing this code?**
A: *"Yes, we integrated the Piston Cloud API to dynamically execute untrusted code in secure sandboxes, allowing us to scale this to over 50 programming languages instantly."*

**Q: Is the crypto real?**
A: *"The cryptography is real. Our backend generates actual ECDSA keys and signs standard transaction payloads. We simulate the on-chain broadcast for the sake of a fast 2-second live demo, but our Solidity contract is ready to be deployed to Base."*
