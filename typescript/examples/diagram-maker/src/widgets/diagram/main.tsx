import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useToolPayload } from "mcpfy-sdk/widget";

mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
});

export default function Diagram() {
    const { output, error, isPending } = useToolPayload();
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderError, setRenderError] = useState("");

    const diagram =
        typeof output?.diagram === "string"
            ? output.diagram.trim()
            : "";

    useEffect(() => {
        if (!diagram || !containerRef.current) {
            return;
        }

        let cancelled = false;

        setRenderError("");
        containerRef.current.innerHTML = "";

        async function renderDiagram() {
            try {
                const id = `diagram-${crypto.randomUUID()}`;
                const { svg, bindFunctions } = await mermaid.render(
                    id,
                    diagram
                );

                if (cancelled || !containerRef.current) {
                    return;
                }

                containerRef.current.innerHTML = svg;

                if (bindFunctions) {
                    bindFunctions(containerRef.current);
                }
            } catch (error) {
                if (!cancelled) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : String(error);

                    setRenderError(message);
                    console.error(error);
                }
            }
        }

        void renderDiagram();

        return () => {
            cancelled = true;
        };
    }, [diagram]);


    if (error) {
        return (
            <div style={{ padding: 20 }}>
                Unable to create diagram: {String(error)}
            </div>
        );
    }

    if (!diagram) {
        return <div style={{ padding: 20 }}>No diagram provided.</div>;
    }

    return (
        <div
            style={{
                padding: 20,
                fontFamily: "system-ui, sans-serif",
            }}
        >
            <h2 style={{ margin: "0 0 16px" }}>Diagram</h2>

            {isPending && (
                <div style={{ padding: 16 }}>
                    Rendering diagram...
                </div>
            )}

            {renderError && !isPending && (
                <div
                    style={{
                        padding: 16,
                        whiteSpace: "pre-wrap",
                    }}
                >
                    Unable to render this Mermaid diagram:
                    <br />
                    {renderError}
                </div>
            )}

            <div
                ref={containerRef}
                style={{
                    overflow: "auto",
                    minHeight: 200,
                }}
            />
        </div>
    );
}