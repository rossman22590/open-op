"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useWindowSize } from "usehooks-ts";

interface ChatFeedProps {
  initialMessage?: string;
  onClose: () => void;
  url?: string;
}

export interface BrowserStep {
  text: string;
  reasoning: string;
  tool: "GOTO" | "ACT" | "EXTRACT" | "OBSERVE" | "CLOSE" | "WAIT" | "NAVBACK";
  instruction: string;
  stepNumber?: number;
}

interface AgentState {
  sessionId: string | null;
  sessionUrl: string | null;
  steps: BrowserStep[];
  isLoading: boolean;
}

export default function ChatFeed({ initialMessage, onClose }: ChatFeedProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { width } = useWindowSize();
  const isMobile = width ? width < 768 : false;
  const initializationRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAgentFinished, setIsAgentFinished] = useState(false);

  const agentStateRef = useRef<AgentState>({
    sessionId: null,
    sessionUrl: null,
    steps: [],
    isLoading: false,
  });

  const [uiState, setUiState] = useState<{
    sessionId: string | null;
    sessionUrl: string | null;
    steps: BrowserStep[];
  }>({
    sessionId: null,
    sessionUrl: null,
    steps: [],
  });

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (
      uiState.steps.length > 0 &&
      uiState.steps[uiState.steps.length - 1].tool === "CLOSE"
    ) {
      setIsAgentFinished(true);
      fetch("/api/session", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: uiState.sessionId,
        }),
      });
    }
  }, [uiState.sessionId, uiState.steps]);

  useEffect(() => {
    scrollToBottom();
  }, [uiState.steps, scrollToBottom]);

  useEffect(() => {
    const initializeSession = async () => {
      if (initializationRef.current) return;
      initializationRef.current = true;

      if (initialMessage && !agentStateRef.current.sessionId) {
        setIsLoading(true);
        try {
          const sessionResponse = await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });
          const sessionData = await sessionResponse.json();

          if (!sessionData.success) {
            throw new Error(sessionData.error || "Failed to create session");
          }

          agentStateRef.current = {
            ...agentStateRef.current,
            sessionId: sessionData.sessionId,
            sessionUrl: sessionData.sessionUrl.replace(
              "https://www.browserbase.com/devtools-fullscreen/inspector.html",
              "https://www.browserbase.com/devtools-internal-compiled/index.html"
            ),
          };

          setUiState({
            sessionId: sessionData.sessionId,
            sessionUrl: agentStateRef.current.sessionUrl,
            steps: [],
          });

          const response = await fetch("/api/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              goal: initialMessage,
              sessionId: sessionData.sessionId,
              action: "START",
            }),
          });
          const data = await response.json();

          if (data.success) {
            const newStep = {
              text: data.result.text,
              reasoning: data.result.reasoning,
              tool: data.result.tool,
              instruction: data.result.instruction,
              stepNumber: 1,
            };

            agentStateRef.current.steps = [newStep];
            setUiState((prev) => ({
              ...prev,
              steps: agentStateRef.current.steps,
            }));

            // Continue with subsequent steps
            while (true) {
              // Get next step from LLM
              const nextStepResponse = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  goal: initialMessage,
                  sessionId: agentStateRef.current.sessionId,
                  previousSteps: agentStateRef.current.steps,
                  action: "GET_NEXT_STEP",
                }),
              });

              const nextStepData = await nextStepResponse.json();
              if (!nextStepData.success) {
                throw new Error("Failed to get next step");
              }

              const nextStep = {
                ...nextStepData.result,
                stepNumber: agentStateRef.current.steps.length + 1,
              };

              agentStateRef.current.steps = [
                ...agentStateRef.current.steps,
                nextStep,
              ];
              setUiState((prev) => ({
                ...prev,
                steps: agentStateRef.current.steps,
              }));

              if (nextStepData.done || nextStepData.result.tool === "CLOSE") {
                break;
              }

              // Execute the step
              const executeResponse = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId: agentStateRef.current.sessionId,
                  step: nextStepData.result,
                  action: "EXECUTE_STEP",
                }),
              });

              const executeData = await executeResponse.json();
              if (!executeData.success) {
                throw new Error("Failed to execute step");
              }

              if (executeData.done) {
                break;
              }
            }
          }
        } catch (error) {
          console.error("Session initialization error:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    initializeSession();
  }, [initialMessage, scrollToBottom]);

  // Spring config for framer-motion transitions
  const springConfig = {
    type: "spring",
    stiffness: 350,
    damping: 30,
  };

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { ...springConfig, staggerChildren: 0.1 },
    },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  };

  const messageVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-tl from-black via-black to-pink-900 text-pink-200 flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.nav
        className="flex justify-between items-center px-8 py-4 bg-black/70 backdrop-blur-sm shadow-lg rounded-b-3xl"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-pink-100 text-xl tracking-wide">
            AI Tutor Browser
          </span>
        </div>
        <motion.button
          onClick={onClose}
          className="px-4 py-2 bg-black/40 hover:bg-black/60 text-pink-200 hover:text-pink-50 transition-colors rounded-full flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Close
          {!isMobile && (
            <kbd className="px-2 py-1 text-xs bg-pink-800/80 rounded-md text-pink-100">
              ESC
            </kbd>
          )}
        </motion.button>
      </motion.nav>

      <main className="flex-1 flex flex-col items-center p-6">
        <motion.div
          className="w-full max-w-[1280px] bg-[#1a1a1a]/80 rounded-2xl shadow-2xl overflow-hidden border border-pink-600/30"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="w-full h-12 bg-[#1a1a1a]/90 flex items-center px-4 border-b border-pink-600/30">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-pink-600" />
              <div className="w-3 h-3 rounded-full bg-pink-400" />
              <div className="w-3 h-3 rounded-full bg-pink-400" />
            </div>
          </div>

          {/* For debugging: check the session URL in console */}
          {(() => {
            console.log("Session URL:", uiState.sessionUrl);
            return null;
          })()}

          <div className="flex flex-col md:flex-row">
            {/* Show the live browser if not finished, else show a message */}
            {!isAgentFinished && uiState.sessionUrl && (
              <div className="flex-1 p-6 border-b md:border-b-0 md:border-l border-pink-600/30 order-first md:order-last">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full aspect-video rounded-xl overflow-hidden"
                >
                  <iframe
                    src={uiState.sessionUrl}
                    className="w-full h-full border-none"
                    sandbox="allow-same-origin allow-scripts allow-forms"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    title="Browser Session"
                  />
                </motion.div>
              </div>
            )}

            {isAgentFinished && (
              <div className="flex-1 p-6 border-b md:border-b-0 md:border-l border-pink-600/30 order-first md:order-last">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full aspect-video rounded-xl bg-black/40 flex items-center justify-center"
                >
                  <p className="text-pink-300 text-center px-6 py-2">
                    The agent has completed the task:
                    <br />
                    <span className="text-pink-100">
                      &quot;{initialMessage}&quot;
                    </span>
                  </p>
                </motion.div>
              </div>
            )}

            {/* Chat area */}
            <div className="md:w-[400px] p-6 min-w-0 md:h-[calc(56.25vw-3rem)] md:max-h-[calc(100vh-12rem)]">
              <div
                ref={chatContainerRef}
                className="h-full overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-pink-800 scrollbar-track-transparent pr-1"
              >
                {/* Show the user’s initial goal */}
                {initialMessage && (
                  <motion.div
                    variants={messageVariants}
                    className="p-4 rounded-lg bg-pink-900/80"
                  >
                    <p className="font-semibold text-pink-200">Goal:</p>
                    <p className="text-pink-100 mt-1">{initialMessage}</p>
                  </motion.div>
                )}

                {uiState.steps.map((step, index) => {
                  return (
                    <motion.div
                      key={index}
                      variants={messageVariants}
                      className="p-4 bg-[#2a2a2a] bg-opacity-75 border border-pink-600/40 rounded-lg space-y-2 text-pink-100"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-pink-300/80">
                          Step {step.stepNumber}
                        </span>
                        <span className="px-2 py-1 bg-pink-800/80 rounded text-xs uppercase tracking-wide">
                          {step.tool}
                        </span>
                      </div>
                      <p className="font-medium text-pink-100">
                        {step.text}
                      </p>
                      <p className="text-sm text-pink-300">
                        <span className="font-semibold">Reasoning: </span>
                        {step.reasoning}
                      </p>
                    </motion.div>
                  );
                })}

                {isLoading && (
                  <motion.div
                    variants={messageVariants}
                    className="p-4 bg-pink-800/60 rounded-lg animate-pulse text-pink-100"
                  >
                    Processing...
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </motion.div>
  );
}


// "use client";

// import { motion } from "framer-motion";
// import { useState, useEffect, useCallback, useRef } from "react";
// import { useWindowSize } from "usehooks-ts";
// import Image from "next/image";
// interface ChatFeedProps {
//   initialMessage?: string;
//   onClose: () => void;
//   url?: string;
// }

// export interface BrowserStep {
//   text: string;
//   reasoning: string;
//   tool: "GOTO" | "ACT" | "EXTRACT" | "OBSERVE" | "CLOSE" | "WAIT" | "NAVBACK";
//   instruction: string;
//   stepNumber?: number;
// }

// interface AgentState {
//   sessionId: string | null;
//   sessionUrl: string | null;
//   steps: BrowserStep[];
//   isLoading: boolean;
// }

// export default function ChatFeed({ initialMessage, onClose }: ChatFeedProps) {
//   const [isLoading, setIsLoading] = useState(false);
//   const { width } = useWindowSize();
//   const isMobile = width ? width < 768 : false;
//   const initializationRef = useRef(false);
//   const chatContainerRef = useRef<HTMLDivElement>(null);
//   const [isAgentFinished, setIsAgentFinished] = useState(false);

//   const agentStateRef = useRef<AgentState>({
//     sessionId: null,
//     sessionUrl: null,
//     steps: [],
//     isLoading: false,
//   });

//   const [uiState, setUiState] = useState<{
//     sessionId: string | null;
//     sessionUrl: string | null;
//     steps: BrowserStep[];
//   }>({
//     sessionId: null,
//     sessionUrl: null,
//     steps: [],
//   });

//   const scrollToBottom = useCallback(() => {
//     if (chatContainerRef.current) {
//       chatContainerRef.current.scrollTop =
//         chatContainerRef.current.scrollHeight;
//     }
//   }, []);

//   useEffect(() => {
//     if (
//       uiState.steps.length > 0 &&
//       uiState.steps[uiState.steps.length - 1].tool === "CLOSE"
//     ) {
//       setIsAgentFinished(true);
//       fetch("/api/session", {
//         method: "DELETE",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           sessionId: uiState.sessionId,
//         }),
//       });
//     }
//   }, [uiState.sessionId, uiState.steps]);

//   useEffect(() => {
//     scrollToBottom();
//   }, [uiState.steps, scrollToBottom]);

//   useEffect(() => {
//     console.log("useEffect called");
//     const initializeSession = async () => {
//       if (initializationRef.current) return;
//       initializationRef.current = true;

//       if (initialMessage && !agentStateRef.current.sessionId) {
//         setIsLoading(true);
//         try {
//           const sessionResponse = await fetch("/api/session", {
//             method: "POST",
//             headers: {
//               "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//               timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
//             }),
//           });
//           const sessionData = await sessionResponse.json();

//           if (!sessionData.success) {
//             throw new Error(sessionData.error || "Failed to create session");
//           }

//           agentStateRef.current = {
//             ...agentStateRef.current,
//             sessionId: sessionData.sessionId,
//             sessionUrl: sessionData.sessionUrl.replace(
//               "https://www.browserbase.com/devtools-fullscreen/inspector.html",
//               "https://www.browserbase.com/devtools-internal-compiled/index.html"
//             ),
//           };

//           setUiState({
//             sessionId: sessionData.sessionId,
//             sessionUrl: sessionData.sessionUrl.replace(
//               "https://www.browserbase.com/devtools-fullscreen/inspector.html",
//               "https://www.browserbase.com/devtools-internal-compiled/index.html"
//             ),
//             steps: [],
//           });

//           const response = await fetch("/api/agent", {
//             method: "POST",
//             headers: {
//               "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//               goal: initialMessage,
//               sessionId: sessionData.sessionId,
//               action: "START",
//             }),
//           });

//           const data = await response.json();

//           if (data.success) {
//             const newStep = {
//               text: data.result.text,
//               reasoning: data.result.reasoning,
//               tool: data.result.tool,
//               instruction: data.result.instruction,
//               stepNumber: 1,
//             };

//             agentStateRef.current = {
//               ...agentStateRef.current,
//               steps: [newStep],
//             };

//             setUiState((prev) => ({
//               ...prev,
//               steps: [newStep],
//             }));

//             // Continue with subsequent steps
//             while (true) {
//               // Get next step from LLM
//               const nextStepResponse = await fetch("/api/agent", {
//                 method: "POST",
//                 headers: {
//                   "Content-Type": "application/json",
//                 },
//                 body: JSON.stringify({
//                   goal: initialMessage,
//                   sessionId: sessionData.sessionId,
//                   previousSteps: agentStateRef.current.steps,
//                   action: "GET_NEXT_STEP",
//                 }),
//               });

//               const nextStepData = await nextStepResponse.json();

//               if (!nextStepData.success) {
//                 throw new Error("Failed to get next step");
//               }

//               // Add the next step to UI immediately after receiving it
//               const nextStep = {
//                 ...nextStepData.result,
//                 stepNumber: agentStateRef.current.steps.length + 1,
//               };

//               agentStateRef.current = {
//                 ...agentStateRef.current,
//                 steps: [...agentStateRef.current.steps, nextStep],
//               };

//               setUiState((prev) => ({
//                 ...prev,
//                 steps: agentStateRef.current.steps,
//               }));

//               // Break after adding the CLOSE step to UI
//               if (nextStepData.done || nextStepData.result.tool === "CLOSE") {
//                 break;
//               }

//               // Execute the step
//               const executeResponse = await fetch("/api/agent", {
//                 method: "POST",
//                 headers: {
//                   "Content-Type": "application/json",
//                 },
//                 body: JSON.stringify({
//                   sessionId: sessionData.sessionId,
//                   step: nextStepData.result,
//                   action: "EXECUTE_STEP",
//                 }),
//               });

//               const executeData = await executeResponse.json();

//               if (!executeData.success) {
//                 throw new Error("Failed to execute step");
//               }

//               if (executeData.done) {
//                 break;
//               }
//             }
//           }
//         } catch (error) {
//           console.error("Session initialization error:", error);
//         } finally {
//           setIsLoading(false);
//         }
//       }
//     };

//     initializeSession();
//   }, [initialMessage]);

//   // Spring configuration for smoother animations
//   const springConfig = {
//     type: "spring",
//     stiffness: 350,
//     damping: 30,
//   };

//   const containerVariants = {
//     hidden: { opacity: 0, scale: 0.95 },
//     visible: {
//       opacity: 1,
//       scale: 1,
//       transition: {
//         ...springConfig,
//         staggerChildren: 0.1,
//       },
//     },
//     exit: {
//       opacity: 0,
//       scale: 0.95,
//       transition: { duration: 0.2 },
//     },
//   };

//   const messageVariants = {
//     hidden: { opacity: 0, y: 20 },
//     visible: { opacity: 1, y: 0 },
//     exit: { opacity: 0, y: -20 },
//   };

//   return (
//     <motion.div
//       className="min-h-screen bg-gray-50 flex flex-col"
//       variants={containerVariants}
//       initial="hidden"
//       animate="visible"
//       exit="exit"
//     >
//       <motion.nav
//         className="flex justify-between items-center px-8 py-4 bg-white border-b border-gray-200 shadow-sm"
//         initial={{ y: -20, opacity: 0 }}
//         animate={{ y: 0, opacity: 1 }}
//         transition={{ delay: 0.2 }}
//       >
//         <div className="flex items-center gap-2">
//           <Image
//             src="/favicon.svg"
//             alt="Open Operator"
//             className="w-8 h-8"
//             width={32}
//             height={32}
//           />
//           <span className="font-ppneue text-gray-900">Open Operator</span>
//         </div>
//         <motion.button
//           onClick={onClose}
//           className="px-4 py-2 hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors rounded-md font-ppsupply flex items-center gap-2"
//           whileHover={{ scale: 1.02 }}
//           whileTap={{ scale: 0.98 }}
//         >
//           Close
//           {!isMobile && (
//             <kbd className="px-2 py-1 text-xs bg-gray-100 rounded-md">ESC</kbd>
//           )}
//         </motion.button>
//       </motion.nav>
//       <main className="flex-1 flex flex-col items-center p-6">
//         <motion.div
//           className="w-full max-w-[1280px] bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden"
//           initial={{ y: 20, opacity: 0 }}
//           animate={{ y: 0, opacity: 1 }}
//           transition={{ delay: 0.3 }}
//         >
//           <div className="w-full h-12 bg-white border-b border-gray-200 flex items-center px-4">
//             <div className="flex items-center gap-2">
//               <div className="w-3 h-3 rounded-full bg-red-500" />
//               <div className="w-3 h-3 rounded-full bg-yellow-500" />
//               <div className="w-3 h-3 rounded-full bg-green-500" />
//             </div>
//           </div>

//           {(() => {
//             console.log("Session URL:", uiState.sessionUrl);
//             return null;
//           })()}

//           <div className="flex flex-col md:flex-row">
//             {uiState.sessionUrl && !isAgentFinished && (
//               <div className="flex-1 p-6 border-b md:border-b-0 md:border-l border-gray-200 order-first md:order-last">
//                 <motion.div
//                   initial={{ opacity: 0 }}
//                   animate={{ opacity: 1 }}
//                   transition={{ delay: 0.4 }}
//                   className="w-full aspect-video"
//                 >
//                   <iframe
//                     src={uiState.sessionUrl}
//                     className="w-full h-full"
//                     sandbox="allow-same-origin allow-scripts allow-forms"
//                     loading="lazy"
//                     referrerPolicy="no-referrer"
//                     title="Browser Session"
//                   />
//                 </motion.div>
//               </div>
//             )}

//             {isAgentFinished && (
//               <div className="flex-1 p-6 border-b md:border-b-0 md:border-l border-gray-200 order-first md:order-last">
//                 <motion.div
//                   initial={{ opacity: 0 }}
//                   animate={{ opacity: 1 }}
//                   transition={{ delay: 0.4 }}
//                   className="w-full aspect-video"
//                 >
//                   <div className="w-full h-full border border-gray-200 rounded-lg flex items-center justify-center">
//                     <p className="text-gray-500 text-center">
//                       The agent has completed the task
//                       <br />
//                       &quot;{initialMessage}&quot;
//                     </p>
//                   </div>
//                 </motion.div>
//               </div>
//             )}

//             <div className="md:w-[400px] p-6 min-w-0 md:h-[calc(56.25vw-3rem)] md:max-h-[calc(100vh-12rem)]">
//               <div
//                 ref={chatContainerRef}
//                 className="h-full overflow-y-auto space-y-4"
//               >
//                 {initialMessage && (
//                   <motion.div
//                     variants={messageVariants}
//                     className="p-4 bg-blue-50 rounded-lg font-ppsupply"
//                   >
//                     <p className="font-semibold">Goal:</p>
//                     <p>{initialMessage}</p>
//                   </motion.div>
//                 )}

//                 {uiState.steps.map((step, index) => (
//                   <motion.div
//                     key={index}
//                     variants={messageVariants}
//                     className="p-4 bg-white border border-gray-200 rounded-lg font-ppsupply space-y-2"
//                   >
//                     <div className="flex justify-between items-center">
//                       <span className="text-sm text-gray-500">
//                         Step {step.stepNumber}
//                       </span>
//                       <span className="px-2 py-1 bg-gray-100 rounded text-xs">
//                         {step.tool}
//                       </span>
//                     </div>
//                     <p className="font-medium">{step.text}</p>
//                     <p className="text-sm text-gray-600">
//                       <span className="font-semibold">Reasoning: </span>
//                       {step.reasoning}
//                     </p>
//                   </motion.div>
//                 ))}
//                 {isLoading && (
//                   <motion.div
//                     variants={messageVariants}
//                     className="p-4 bg-gray-50 rounded-lg font-ppsupply animate-pulse"
//                   >
//                     Processing...
//                   </motion.div>
//                 )}
//               </div>
//             </div>
//           </div>
//         </motion.div>
//       </main>
//     </motion.div>
//   );
// }
