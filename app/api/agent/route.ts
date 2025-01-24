// app/api/agent/route.ts

import { NextResponse } from 'next/server';
import { openai } from "@ai-sdk/openai";
import { generateObject, CoreMessage, UserContent } from "ai";
import { z } from "zod";
import { Stagehand, ObserveResult } from "@browserbasehq/stagehand";

////////////////////////////////////////////////////
// Setup your OpenAI & Stagehand clients
////////////////////////////////////////////////////
const LLMClient = openai("gpt-4o");

type Step = {
  text: string;
  reasoning: string;
  tool:
    | "GOTO"
    | "ACT"
    | "EXTRACT"
    | "OBSERVE"
    | "CLOSE"
    | "WAIT"
    | "NAVBACK";
  instruction: string;
};

////////////////////////////////////////////////////
// runStagehand: executes a single tool action
////////////////////////////////////////////////////
async function runStagehand({
  sessionID,
  method,
  instruction,
}: {
  sessionID: string;
  method:
    | "GOTO"
    | "ACT"
    | "EXTRACT"
    | "OBSERVE"
    | "CLOSE"
    | "SCREENSHOT"
    | "WAIT"
    | "NAVBACK";
  instruction?: string;
}) {
  // Create Stagehand with existing session or new session
  const stagehand = new Stagehand({
    browserbaseSessionID: sessionID,
    env: "BROWSERBASE",
    logger: () => {},
  });

  await stagehand.init();
  const page = stagehand.page;

  try {
    switch (method) {
      case "GOTO":
        await page.goto(instruction!, { waitUntil: "commit", timeout: 60000 });
        break;
      case "ACT":
        await page.act(instruction!);
        break;
      case "EXTRACT": {
        const { extraction } = await page.extract(instruction!);
        return extraction;
      }
      case "OBSERVE":
        return await page.observe({
          instruction,
          useAccessibilityTree: true,
        });
      case "CLOSE":
        await stagehand.close(); // This permanently ends the session
        break;
      case "SCREENSHOT": {
        const cdpSession = await page.context().newCDPSession(page);
        const { data } = await cdpSession.send("Page.captureScreenshot");
        return data;
      }
      case "WAIT":
        await new Promise((resolve) => setTimeout(resolve, Number(instruction)));
        break;
      case "NAVBACK":
        await page.goBack();
        break;
    }
  } catch (error) {
    await stagehand.close();
    throw error;
  }
}

////////////////////////////////////////////////////
// sendPrompt: asks the LLM to generate next step
////////////////////////////////////////////////////
async function sendPrompt({
  goal,
  sessionID,
  previousSteps = [],
  previousExtraction,
}: {
  goal: string;
  sessionID: string;
  previousSteps?: Step[];
  previousExtraction?: string | ObserveResult[];
}) {
  let currentUrl = "";

  // Attempt to get the current browser URL
  try {
    const urlResult = await runStagehand({
      sessionID,
      method: "EXTRACT",
      instruction: "return document.location.href",
    });
    if (typeof urlResult === "string") {
      currentUrl = urlResult;
    }
  } catch (error) {
    console.error("Error getting page info:", error);
  }

  const content: UserContent = [
    {
      type: "text",
      text: `Consider the following screenshot of a web page${
        currentUrl ? ` (URL: ${currentUrl})` : ""
      }, with the goal being "${goal}".
${
  previousSteps.length > 0
    ? `Previous steps taken:
${previousSteps
  .map(
    (step, index) => `
Step ${index + 1}:
- Action: ${step.text}
- Reasoning: ${step.reasoning}
- Tool Used: ${step.tool}
- Instruction: ${step.instruction}`
  )
  .join("\n")}`
    : ""
}
Determine the immediate next step to take to achieve the goal.

Important guidelines:
1. Break down complex actions into small atomic steps
2. For ACT commands, use only one action at a time (click, type, etc.)
3. Avoid combining multiple actions into one step
4. If multiple actions are needed, separate them into multiple steps
5. If the goal is achieved, return "CLOSE".`,
    },
  ];

  // If they've used GOTO before, include a screenshot
  if (previousSteps.some((step) => step.tool === "GOTO")) {
    try {
      const screenshot = await runStagehand({
        sessionID,
        method: "SCREENSHOT",
      });
      if (typeof screenshot === "string") {
        content.push({
          type: "image",
          image: screenshot,
        });
      }
    } catch (err) {
      console.error("Error capturing screenshot:", err);
    }
  }

  if (previousExtraction) {
    content.push({
      type: "text",
      text: `The result of the previous ${
        Array.isArray(previousExtraction) ? "observation" : "extraction"
      } is: ${previousExtraction}.`,
    });
  }

  const message: CoreMessage = {
    role: "user",
    content,
  };

  // Use zod to parse the LLM response into a Step
  const result = await generateObject({
    model: LLMClient,
    schema: z.object({
      text: z.string(),
      reasoning: z.string(),
      tool: z.enum([
        "GOTO",
        "ACT",
        "EXTRACT",
        "OBSERVE",
        "CLOSE",
        "WAIT",
        "NAVBACK",
      ]),
      instruction: z.string(),
    }),
    messages: [message],
  });

  return {
    result: result.object,
    previousSteps: [...previousSteps, result.object],
  };
}

////////////////////////////////////////////////////
// selectStartingUrl: picks a URL to begin with
////////////////////////////////////////////////////
async function selectStartingUrl(goal: string) {
  const message: CoreMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: `Given the goal: "${goal}", determine the best URL to start from.
Choose from:
1. A relevant search engine (Google, Bing, etc.)
2. A direct URL if confident about the target
3. Another appropriate starting point

Return a URL that is most effective for this goal.`,
      },
    ],
  };

  const result = await generateObject({
    model: LLMClient,
    schema: z.object({
      url: z.string().url(),
      reasoning: z.string(),
    }),
    messages: [message],
  });

  return result.object;
}

////////////////////////////////////////////////////
// GET /api/agent - a simple readiness check
////////////////////////////////////////////////////
export async function GET() {
  return NextResponse.json({ message: "Agent API endpoint ready" });
}

////////////////////////////////////////////////////
// POST /api/agent - the main logic
////////////////////////////////////////////////////
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { goal, sessionId, previousSteps = [], action, step } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId in request body" },
        { status: 400 }
      );
    }

    switch (action) {
      ////////////////////////////////////////////////////
      // 1) START
      ////////////////////////////////////////////////////
      case "START": {
        if (!goal) {
          return NextResponse.json(
            { error: "Missing goal in request body" },
            { status: 400 }
          );
        }
        // Pick the starting URL
        const { url, reasoning } = await selectStartingUrl(goal);
        const firstStep: Step = {
          text: `Navigating to ${url}`,
          reasoning,
          tool: "GOTO",
          instruction: url,
        };

        await runStagehand({
          sessionID: sessionId,
          method: "GOTO",
          instruction: url,
        });

        return NextResponse.json({
          success: true,
          result: firstStep,
          steps: [firstStep],
          done: false,
        });
      }

      ////////////////////////////////////////////////////
      // 2) GET_NEXT_STEP
      ////////////////////////////////////////////////////
      case "GET_NEXT_STEP": {
        if (!goal) {
          return NextResponse.json(
            { error: "Missing goal in request body" },
            { status: 400 }
          );
        }

        // Ask the LLM for the next step
        const { result, previousSteps: newPreviousSteps } = await sendPrompt({
          goal,
          sessionID: sessionId,
          previousSteps,
        });

        // If the LLM suggests "CLOSE", also automatically close the session
        const isDone = result.tool === "CLOSE";

        if (isDone) {
          await runStagehand({
            sessionID: sessionId,
            method: "CLOSE",
          });
        }

        return NextResponse.json({
          success: true,
          result,
          steps: newPreviousSteps,
          done: isDone,
        });
      }

      ////////////////////////////////////////////////////
      // 3) EXECUTE_STEP
      ////////////////////////////////////////////////////
      case "EXECUTE_STEP": {
        if (!step) {
          return NextResponse.json(
            { error: "Missing step in request body" },
            { status: 400 }
          );
        }
        // Run the requested step
        const extraction = await runStagehand({
          sessionID: sessionId,
          method: step.tool,
          instruction: step.instruction,
        });

        // If the user explicitly executed "CLOSE", shut down the session
        const isDone = step.tool === "CLOSE";
        if (isDone) {
          await runStagehand({
            sessionID: sessionId,
            method: "CLOSE",
          });
        }

        return NextResponse.json({
          success: true,
          extraction,
          done: isDone,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action type" },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error("Error in agent endpoint:", error);

    let errorMessage = "Failed to process request.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
