"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import ChatFeed from "./components/ChatFeed";
import AnimatedButton from "./components/AnimatedButton";
import posthog from "posthog-js";

export default function Home() {
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle CMD+Enter to submit
      if (!isChatVisible && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const form = document.querySelector("form") as HTMLFormElement;
        if (form) {
          form.requestSubmit();
        }
      }

      // Handle CMD+K to focus the input
      if (!isChatVisible && (e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector(
          'input[name="message"]'
        ) as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }

      // Handle ESC to close chat
      if (isChatVisible && e.key === "Escape") {
        e.preventDefault();
        setIsChatVisible(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isChatVisible]);

  const startChat = useCallback((finalMessage: string) => {
    setInitialMessage(finalMessage);
    setIsChatVisible(true);

    try {
      posthog.capture("submit_message", { message: finalMessage });
    } catch (e) {
      console.error(e);
    }
  }, []);

  return (
    <AnimatePresence mode="wait">
      {!isChatVisible ? (
        <div className="min-h-screen bg-gradient-to-tl from-black via-black to-pink-900 text-pink-200 flex flex-col">
          {/* Top Navigation */}
          <nav className="flex justify-between items-center px-8 py-4 bg-black/70 backdrop-blur-sm shadow-lg rounded-b-3xl">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-pink-100 tracking-wide">
                AI Tutor Browser
              </span>
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-[640px] bg-[#1a1a1a]/80 rounded-2xl shadow-2xl overflow-hidden border border-pink-600/30">
              <div className="w-full h-12 bg-[#1a1a1a]/90 flex items-center px-4 border-b border-pink-600/30">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-pink-600" />
                  <div className="w-3 h-3 rounded-full bg-pink-400" />
                  <div className="w-3 h-3 rounded-full bg-pink-400" />
                </div>
              </div>

              <div className="p-8 flex flex-col items-center gap-8">
                {/* Title Section */}
                <div className="flex flex-col items-center gap-3">
                  <h1 className="text-2xl font-bold text-pink-100 text-center">
                    AI Tutor Browser
                  </h1>
                  <p className="text-base text-pink-300/80 text-center">
                    Hit &quot;Run&quot; to watch AI browse the web.
                  </p>
                </div>

                {/* Form with pill-shaped input + Run button */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const input = e.currentTarget.querySelector(
                      'input[name="message"]'
                    ) as HTMLInputElement;
                    const message = (formData.get("message") as string).trim();
                    const finalMessage = message || input.placeholder;
                    startChat(finalMessage);
                  }}
                  className="w-full flex flex-col items-center gap-3"
                >
                  <div className="relative w-full rounded-full overflow-hidden border border-pink-600 focus-within:ring-2 focus-within:ring-pink-500/80">
                    <input
                      name="message"
                      type="text"
                      placeholder="What's the price of Bitcoin on coinbase today ?"
                      className="w-full bg-black/30 text-pink-200 placeholder-pink-400
                                 px-4 py-3 pr-[90px] focus:outline-none focus:bg-black/40
                                 rounded-full"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <AnimatedButton type="submit" className="rounded-full px-5 py-2">
                        Run
                      </AnimatedButton>
                    </div>
                  </div>
                </form>

                {/* Example Quick Buttons */}
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    onClick={() =>
                      startChat(
                        "Find me a budget-friendly laptop that’s good for coding."
                      )
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    Find a budget coding laptop
                  </button>
                  <button
                    onClick={() =>
                      startChat("What are some beginner-friendly investing tips?")
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    Investing tips for beginners
                  </button>
                  <button
                    onClick={() =>
                      startChat("What are the top-rated sushi restaurants in NYC?")
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    Top sushi spots in NYC
                  </button>
                  <button
                    onClick={() =>
                      startChat("Show me the best exercises for building upper-body strength.")
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    Best upper-body exercises
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    onClick={() =>
                      startChat("Plan a weeknight dinner menu with quick, healthy recipes.")
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    Quick healthy dinner ideas
                  </button>
                  <button
                    onClick={() =>
                      startChat("Find me a quality set of watercolor paints under $50.")
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    Watercolor paints under $50
                  </button>
                  <button
                    onClick={() =>
                      startChat("What are the key differences between iOS and Android development?")
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    iOS vs Android dev
                  </button>
                  <button
                    onClick={() =>
                      startChat("Show me the best deals on flights to Tokyo next month.")
                    }
                    className="p-3 text-sm bg-black/20 hover:bg-black/40 text-pink-200 
                               rounded-md transition-colors text-left"
                  >
                    Flight deals to Tokyo
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      ) : (
        <ChatFeed
          initialMessage={initialMessage}
          onClose={() => setIsChatVisible(false)}
        />
      )}
    </AnimatePresence>
  );
}
