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
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
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

          agentStateRef.current.sessionId = sessionData.sessionId;
          agentStateRef.current.sessionUrl = sessionData.sessionUrl.replace(
            "https://www.browserbase.com/devtools-fullscreen/inspector.html",
            "https://www.browserbase.com/devtools-internal-compiled/index.html"
          );

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

            while (true) {
              const nextStepRes = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  goal: initialMessage,
                  sessionId: agentStateRef.current.sessionId,
                  previousSteps: agentStateRef.current.steps,
                  action: "GET_NEXT_STEP",
                }),
              });
              const nextStepData = await nextStepRes.json();
              if (!nextStepData.success) {
                throw new Error("Failed to get next step");
              }

              const nextStep = {
                ...nextStepData.result,
                stepNumber: agentStateRef.current.steps.length + 1,
              };

              agentStateRef.current.steps.push(nextStep);
              setUiState((prev) => ({
                ...prev,
                steps: [...agentStateRef.current.steps],
              }));

              if (nextStepData.done || nextStepData.result.tool === "CLOSE") {
                break;
              }

              const executeRes = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId: agentStateRef.current.sessionId,
                  step: nextStepData.result,
                  action: "EXECUTE_STEP",
                }),
              });
              const executeData = await executeRes.json();
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
  }, [initialMessage]);

  const springConfig = { type: "spring", stiffness: 350, damping: 30 };
  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { ...springConfig, staggerChildren: 0.1 },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };
  const messageVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <motion.div
      className="h-screen w-screen bg-gradient-to-tl from-black via-black to-pink-900 text-pink-200 flex flex-col overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.nav
        className="flex justify-between items-center px-8 py-2 bg-black/70 backdrop-blur-sm shadow-lg"
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

      <main className="flex-1 flex overflow-hidden">
        <motion.div
          className="w-full h-full bg-[#1a1a1a]/80 shadow-2xl overflow-hidden border border-pink-600/30 flex flex-col"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="w-full h-8 bg-[#1a1a1a]/90 flex items-center px-4 border-b border-pink-600/30">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-pink-600" />
              <div className="w-2 h-2 rounded-full bg-pink-400" />
              <div className="w-2 h-2 rounded-full bg-pink-400" />
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className="w-[420px] flex flex-col border-r border-pink-600/30">
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 p-4 scrollbar-thin scrollbar-thumb-pink-800 scrollbar-track-transparent"
              >
                {initialMessage && (
                  <motion.div
                    variants={messageVariants}
                    className="p-4 rounded-lg bg-pink-900/80"
                  >
                    <p className="font-semibold text-pink-200">Goal:</p>
                    <p className="text-pink-100 mt-1">{initialMessage}</p>
                  </motion.div>
                )}

                {uiState.steps.map((step, index) => (
                  <motion.div
                    key={index}
                    variants={messageVariants}
                    className="p-4 bg-[#2a2a2a]/80 border border-pink-600/40 rounded-lg space-y-2 text-pink-100"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-pink-300/80">
                        Step {step.stepNumber}
                      </span>
                      <span className="px-2 py-1 bg-pink-800/80 rounded text-xs uppercase tracking-wide">
                        {step.tool}
                      </span>
                    </div>
                    <p className="font-medium text-pink-100">{step.text}</p>
                    <p className="text-sm text-pink-300">
                      <span className="font-semibold">Reasoning: </span>
                      {step.reasoning}
                    </p>
                  </motion.div>
                ))}

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

            <div className="flex-1">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="w-full h-full bg-black/40 flex items-center justify-center"
              >
                {(!uiState.sessionUrl || isAgentFinished) ? (
                  <p className="text-pink-300 text-center px-6 py-2">
                    {isAgentFinished ? (
                      <>
                        The agent has completed the task:
                        <br />
                        <span className="text-pink-100">
                          &quot;{initialMessage}&quot;
                        </span>
                      </>
                    ) : (
                      "No session URL available."
                    )}
                  </p>
                ) : (
                  <iframe
                    src={uiState.sessionUrl}
                    className="w-full h-full border-none"
                    sandbox="allow-same-origin allow-scripts allow-forms"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    title="Browser Session"
                  />
                )}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </main>
    </motion.div>
  );
}
