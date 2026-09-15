import React, { useState } from "react";
import { useToolPayload, useLinkedTool } from "mcpfy-sdk/widget";

// This is the standard widget entry point convention: src/widgets/<name>/main.tsx.
// The mcpfy runtime wraps this component with ThemeProvider and HostRuntime
// automatically — do not add those providers here yourself.
export default function ExampleWidget() {
  const { input, output, isPending, error } = useToolPayload();
  const tool = useLinkedTool(); // re-calls this widget's own tool ("example-widget")
  const [clicks, setClicks] = useState(0);

  if (isPending) {
    return <p>Loading...</p>;
  }

  if (error) {
    return <p>Something went wrong: {error.message}</p>;
  }

  const label = String(input?.label ?? "World");

  return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem" }}>
      <h2>Hello, {label}!</h2>
      <p>Local clicks: {clicks}</p>
      <button
        onClick={() => {
          setClicks((c) => c + 1);
          tool.call({ label }); // re-invoke the bound tool with the same input
        }}
      >
        Increment & refresh
      </button>
    </div>
  );
}
