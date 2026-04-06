import React from "react";

function parsePromptSections(prompt) {
    if (!prompt) return [];

    const normalized = prompt.replace(/\r\n/g, "\n").trim();

    // σπάσιμο στα μεγάλα dashed separators
    const rawSections = normalized
        .split(/-{20,}/)
        .map((s) => s.trim())
        .filter(Boolean);

    return rawSections.map((section, index) => {
        const match = section.match(/^([A-Z0-9 /&()-]+):\s*([\s\S]*)$/);

        if (match) {
            return {
                id: index,
                title: match[1].trim(),
                content: match[2].trim(),
            };
        }

        return {
            id: index,
            title: `SECTION ${index + 1}`,
            content: section,
        };
    });
}

export default function PromptPanel({ prompt }) {
    const sections = parsePromptSections(prompt);

    if (!prompt) {
        return <div>No prompt available.</div>;
    }

    return (
        <div style={{ width: "100%" }}>
            {sections.map((section) => (
                <div
                    key={section.id}
                    style={{
                        border: "1px solid #e3e3e3",
                        borderRadius: 10,
                        background: "#fafafa",
                        padding: 16,
                        marginBottom: 14,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                >
                    <div
                        style={{
                            display: "inline-block",
                            background: "#ececec",
                            padding: "6px 10px",
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                            marginBottom: 12,
                        }}
                    >
                        {section.title}
                    </div>

                    <div
                        style={{
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.6,
                            fontSize: 14,
                            color: "#222",
                        }}
                    >
                        {section.content}
                    </div>
                </div>
            ))}
        </div>
    );
}