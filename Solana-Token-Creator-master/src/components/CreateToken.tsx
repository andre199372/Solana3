import React, { FC, useCallback, useState, useMemo, createContext, useContext } from "react";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint } from "@solana/spl-token";
import { createCreateMetadataAccountV3Instruction, PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { WalletAdapterNetwork, WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter, TorusWalletAdapter } from '@solana/wallet-adapter-wallets';
import { ClipLoader } from "react-spinners";

// Default styles for wallet adapter UI
import '@solana/wallet-adapter-react-ui/styles.css';

// --- Mock Utilities and Contexts for self-contained example ---

// Mock notify function
const notify = ({ type, message, txid }) => {
  console.log(`[${type.toUpperCase()}] ${message}${txid ? ` (Tx: ${txid})` : ''}`);
  // In a real app, you would display a toast notification here
  alert(`[${type.toUpperCase()}] ${message}${txid ? `\nTransaction ID: ${txid}` : ''}`);
};

// Mock NetworkConfigurationContext
const NetworkConfigurationContext = createContext(null);

const NetworkConfigurationProvider = ({ children }) => {
  const [networkConfiguration, setNetworkConfiguration] = useState(WalletAdapterNetwork.Devnet); // Default to Devnet

  return (
    <NetworkConfigurationContext.Provider value={{ networkConfiguration, setNetworkConfiguration }}>
      {children}
    </NetworkConfigurationContext.Provider>
  );
};

const useNetworkConfiguration = () => {
  const context = useContext(NetworkConfigurationContext);
  if (!context) {
    throw new Error('useNetworkConfiguration must be used within a NetworkConfigurationProvider');
  }
  return context;
};

// --- Original CreateToken Component (with minor adjustments for self-containment) ---

export const CreateToken = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { networkConfiguration } = useNetworkConfiguration();

  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenUri, setTokenUri] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState("9");
  const [tokenMintAddress, setTokenMintAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fixed fee recipient address
  const fixedFeeRecipientAddress = "MrQDfQXK7B2qwkQNoLYPrs4SZ3nxxDcCg9Wbrac2w4f";

  const createToken = useCallback(async () => {
    if (!publicKey) {
      notify({ type: "error", message: `Wallet not connected!` });
      return;
    }

    let recipientPublicKey;
    try {
      recipientPublicKey = new PublicKey(fixedFeeRecipientAddress);
    } catch (error) {
      // This case should be rare since the address is hardcoded
      notify({ type: "error", message: `Invalid fixed fee recipient address: ${error.message}` });
      return;
    }

    setIsLoading(true);
    try {
      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      const mintKeypair = Keypair.generate();

      // Fixed fee of 0.15 SOL
      const feeAmountLamports = 0.15 * LAMPORTS_PER_SOL;

      const tx = new Transaction().add(
        // Instruction to create the token mint account
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),

        // Instruction to initialize the token mint
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          Number(tokenDecimals),
          publicKey, // Mint Authority
          publicKey, // Freeze Authority (can be null if no freeze authority is desired)
          TOKEN_PROGRAM_ID,
        ),

        // Instruction to create the token metadata account
        createCreateMetadataAccountV3Instruction(
          {
            metadata: (
              await PublicKey.findProgramAddress(
                [
                  Buffer.from("metadata"),
                  PROGRAM_ID.toBuffer(),
                  mintKeypair.publicKey.toBuffer(),
                ],
                PROGRAM_ID,
              )
            )[0],
            mint: mintKeypair.publicKey,
            mintAuthority: publicKey,
            payer: publicKey,
            updateAuthority: publicKey,
          },
          {
            createMetadataAccountArgsV3: {
              data: {
                name: tokenName,
                symbol: tokenSymbol,
                uri: tokenUri,
                creators: null, // No creators specified
                sellerFeeBasisPoints: 0,
                collection: null, // No collection specified
                uses: null, // No uses specified
              },
              isMutable: false, // Token metadata is immutable after creation
              collectionDetails: null, // No collection details specified
            },
          },
        ),
        // Instruction to transfer the fee to the fixed address
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientPublicKey,
          lamports: feeAmountLamports,
        })
      );

      const signature = await sendTransaction(tx, connection, {
        signers: [mintKeypair],
      });
      setTokenMintAddress(mintKeypair.publicKey.toString());
      notify({
        type: "success",
        message: "Token creation successful",
        txid: signature,
      });
    } catch (error) {
      console.error("Token creation failed:", error);
      notify({ type: "error", message: `Token creation failed: ${error.message || error}` });
    } finally {
      setIsLoading(false);
    }
  }, [
    publicKey,
    connection,
    tokenDecimals,
    tokenName,
    tokenSymbol,
    tokenUri,
    sendTransaction,
  ]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      {isLoading && (
        <div className="absolute top-0 left-0 z-50 flex h-full w-full items-center justify-center bg-black/[.6] backdrop-blur-sm">
          <ClipLoader color="#14F195" size={50} />
        </div>
      )}
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-2xl">
        <h1 className="text-4xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-[#9945FF] to-[#14F195]">
          Create Solana SPL Token
        </h1>
        {!tokenMintAddress ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <label htmlFor="tokenName" className="text-xl font-medium text-gray-300">Token Name</label>
              <input
                id="tokenName"
                className="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-xl font-normal text-white placeholder-gray-400 focus:border-[#14F195] focus:outline-none transition duration-200"
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="e.g., My Awesome Token"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="flex flex-col">
                <label htmlFor="tokenSymbol" className="text-xl font-medium text-gray-300">Token Symbol</label>
                <p className="text-sm text-gray-400">Abbreviated name (e.g., Solana -> SOL).</p>
              </div>
              <input
                id="tokenSymbol"
                className="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-xl font-normal text-white placeholder-gray-400 focus:border-[#14F195] focus:outline-none transition duration-200"
                onChange={(e) => setTokenSymbol(e.target.value)}
                placeholder="e.g., MAT"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="flex flex-col">
                <label htmlFor="tokenUri" className="text-xl font-medium text-gray-300">Token URI</label>
                <p className="text-sm text-gray-400">Link to your metadata JSON file.</p>
                <p className="text-sm text-gray-400">You can leave it blank if you don't need a token image.</p>
              </div>
              <input
                id="tokenUri"
                className="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-xl font-normal text-white placeholder-gray-400 focus:border-[#14F195] focus:outline-none transition duration-200"
                onChange={(e) => setTokenUri(e.target.value)}
                placeholder="e.g., https://example.com/metadata.json"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="flex flex-col">
                <label htmlFor="tokenDecimals" className="text-xl font-medium text-gray-300">Token Decimals</label>
                <p className="text-sm text-gray-400">Default value is 9 for Solana.</p>
              </div>
              <input
                id="tokenDecimals"
                className="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-xl font-normal text-white placeholder-gray-400 focus:border-[#14F195] focus:outline-none transition duration-200"
                type="number"
                min={0}
                value={tokenDecimals}
                onChange={(e) => setTokenDecimals(e.target.value)}
              />
            </div>
            {/* Removed fixed fee information from the UI */}

            <div className="flex justify-center mt-8">
              <button
                className="btn m-2 px-8 py-3 rounded-full text-lg font-semibold text-white bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 transition duration-300 transform hover:scale-105 shadow-lg"
                onClick={createToken}
                disabled={isLoading}
              >
                {isLoading ? "Creating..." : "Create Token"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 text-center break-words">
            <p className="font-medium text-xl mb-4 text-gray-300">Your new token has been created!</p>
            <p className="font-medium text-lg mb-2">Token Mint Address:</p>
            <a
              className="cursor-pointer font-medium text-xl text-purple-400 hover:text-indigo-300 transition duration-200 block"
              href={`https://explorer.solana.com/address/${tokenMintAddress}?cluster=${networkConfiguration}`}
              target="_blank"
              rel="noreferrer"
            >
              {tokenMintAddress}
            </a>
            <button
              className="mt-6 px-6 py-2 rounded-full text-md font-semibold text-white bg-gray-700 hover:bg-gray-600 transition duration-200"
              onClick={() => {
                setTokenMintAddress("");
                setTokenName("");
                setTokenSymbol("");
                setTokenUri("");
                setTokenDecimals("9");
              }}
            >
              Create another token
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main App Component ---

const App = () => {
  // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Devnet;

  // You can specify a list of desired wallets here, or leave it empty for all available wallets.
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new TorusWalletAdapter(),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <NetworkConfigurationProvider>
            <div className="min-h-screen bg-gray-900 font-inter">
              {/* Tailwind CSS CDN */}
              <script src="https://cdn.tailwindcss.com"></script>
              {/* Inter font from Google Fonts */}
              <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

              <style>{`
                body {
                  font-family: 'Inter', sans-serif;
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
                }
                .btn {
                  padding: 0.75rem 1.5rem;
                  border-radius: 0.5rem;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.3s ease;
                }
                .btn:hover {
                  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                }
                /* Custom scrollbar for better aesthetics */
                ::-webkit-scrollbar {
                  width: 8px;
                }
                ::-webkit-scrollbar-track {
                  background: #333;
                }
                ::-webkit-scrollbar-thumb {
                  background: #888;
                  border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                  background: #555;
                }
              `}</style>
              <div className="flex justify-end p-4">
                <WalletMultiButton />
              </div>
              <CreateToken />
            </div>
          </NetworkConfigurationProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;