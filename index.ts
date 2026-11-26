import { addChatBarButton, ChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { React, useRef, useState } from "@webpack/common";

type swatchEntry = {
    name: string;
    hex: string;
    code: string;
};

type effectEntry = {
    name: string;
    css: string;
    colorAt: (index: number, total: number) => string;
};

const escapeChar = String.fromCharCode(27);
const baseTextColor = "#dcddde";
const editorBackground = "#36384a";
const cubeLevels = [0, 95, 135, 175, 215, 255];

const xtermTable: number[][] = [];

for (let index = 0; index < 256; index++) {
    if (index < 16) {
        xtermTable.push([0, 0, 0]);
    } else if (index >= 232) {
        const level = 8 + (index - 232) * 10;
        xtermTable.push([level, level, level]);
    } else {
        const offset = index - 16;
        xtermTable.push([
            cubeLevels[Math.floor(offset / 36)],
            cubeLevels[Math.floor(offset / 6) % 6],
            cubeLevels[offset % 6]
        ]);
    }
}

function nearestIndex(red: number, green: number, blue: number) {
    let best = 16;
    let bestDistance = Infinity;

    for (let index = 16; index < 256; index++) {
        const entry = xtermTable[index];
        const distance = (entry[0] - red) ** 2 + (entry[1] - green) ** 2 + (entry[2] - blue) ** 2;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
        }
    }

    return best;
}

function rgbToHex(rgb: number[]) {
    return "#" + rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];
}

function snapRgb(red: number, green: number, blue: number) {
    return rgbToHex(xtermTable[nearestIndex(red, green, blue)]);
}

function snapHex(hex: string) {
    const rgb = hexToRgb(hex);
    return snapRgb(rgb[0], rgb[1], rgb[2]);
}

function cssToRgb(value: string) {
    const matches = value.match(/\d+(\.\d+)?/g);
    return matches ? matches.slice(0, 3).map(Number) : [0, 0, 0];
}

function hueToHex(hue: number) {
    const lightness = 0.65;
    const amount = 0.35;
    const channel = (offset: number) => {
        const position = (offset + hue / 30) % 12;
        return (lightness - amount * Math.max(-1, Math.min(position - 3, 9 - position, 1))) * 255;
    };
    return snapRgb(channel(0), channel(8), channel(4));
}

function mixHex(fromHex: string, toHex: string, amount: number) {
    const fromRgb = hexToRgb(fromHex);
    const toRgb = hexToRgb(toHex);
    const mixed = fromRgb.map((value, index) => value + (toRgb[index] - value) * amount);
    return snapRgb(mixed[0], mixed[1], mixed[2]);
}

const classicColors: swatchEntry[] = [
    { name: "black", hex: "#000000", code: "30" },
    { name: "red", hex: "#ed6565", code: "31" },
    { name: "green", hex: "#43a366", code: "32" },
    { name: "orange", hex: "#cc8200", code: "33" },
    { name: "blue", hex: "#4590ee", code: "34" },
    { name: "pink", hex: "#f84bc8", code: "35" },
    { name: "cyan", hex: "#00a0aa", code: "36" },
    { name: "gray", hex: "#b9bbbe", code: "37" }
];

const classicCodeByKey = new Map<string, string>();

for (const entry of classicColors) {
    classicCodeByKey.set(hexToRgb(entry.hex).join(","), entry.code);
}

const baseKey = hexToRgb(baseTextColor).join(",");

function escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainToHtml(value: string) {
    return escapeHtml(value).replace(/\n/g, "<br>");
}

function italicText(value: string) {
    return Array.from(value).map(character => {
        const code = character.codePointAt(0) ?? 0;
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d608 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d622 + code - 97);
        return character;
    }).join("");
}

function strikeText(value: string) {
    return Array.from(value).map(character => (character === "\n" || character === " " ? character : character + "\u0336")).join("");
}

function readFlags(element: HTMLElement, root: HTMLElement) {
    const italic = window.getComputedStyle(element).fontStyle === "italic";
    let strike = false;
    let current: HTMLElement | null = element;

    while (current && current !== root) {
        if (window.getComputedStyle(current).textDecorationLine.includes("line-through")) strike = true;
        current = current.parentElement;
    }

    return { italic, strike };
}

function readCodes(element: HTMLElement, root: HTMLElement) {
    const codes: string[] = [];
    const computed = window.getComputedStyle(element);

    if (parseInt(computed.fontWeight, 10) >= 600) codes.push("1");

    let underlined = false;
    let background = "";
    let current: HTMLElement | null = element;

    while (current && current !== root) {
        const currentStyle = window.getComputedStyle(current);
        if (currentStyle.textDecorationLine.includes("underline")) underlined = true;
        if (!background) {
            const value = currentStyle.backgroundColor;
            if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") background = value;
        }
        current = current.parentElement;
    }

    if (underlined) codes.push("4");

    const foreground = cssToRgb(computed.color);
    const foregroundKey = foreground.join(",");

    if (foregroundKey !== baseKey) {
        const classicCode = classicCodeByKey.get(foregroundKey);
        codes.push(classicCode ?? `38;5;${nearestIndex(foreground[0], foreground[1], foreground[2])}`);
    }

    if (background) {
        const backgroundRgb = cssToRgb(background);
        codes.push(`48;5;${nearestIndex(backgroundRgb[0], backgroundRgb[1], backgroundRgb[2])}`);
    }

    return codes.join(";");
}

function buildAnsi(root: HTMLElement) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let output = "";
    let activeStyle = "";
    let node = walker.nextNode();

    while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = (node.textContent ?? "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
            const parent = node.parentElement;

            if (text && parent) {
                const style = readCodes(parent, root);

                if (style !== activeStyle) {
                    output += style ? `${escapeChar}[0;${style}m` : `${escapeChar}[0m`;
                    activeStyle = style;
                }

                const flags = readFlags(parent, root);
                let converted = text;
                if (flags.italic) converted = italicText(converted);
                if (flags.strike) converted = strikeText(converted);
                output += converted;
            }
        } else if ((node as HTMLElement).tagName === "BR") {
            output += "\n";
        }

        node = walker.nextNode();
    }

    output = output.replace(/\n+$/, "");
    if (activeStyle) output += `${escapeChar}[0m`;
    return output;
}

function formatMessage(root: HTMLElement) {
    const body = buildAnsi(root);
    if (!body.replace(/\u001b\[[0-9;]*m/g, "").trim()) return "";
    return "```ansi\n" + body + "\n```";
}

function runCommand(name: string, value?: string) {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(name, false, value);
}

function selectedText(root: HTMLElement) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) return "";
    return selection.toString();
}

function findChatBox() {
    return document.querySelector<HTMLElement>('[class*="channelTextArea"] [role="textbox"]')
        ?? document.querySelector<HTMLElement>('[role="textbox"][data-slate-editor="true"]');
}

function pasteIntoChat(text: string) {
    const box = findChatBox();

    if (!box) {
        insertTextIntoChatInputBox(text);
        return;
    }

    box.focus();
    const data = new DataTransfer();
    data.setData("text/plain", text);
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}

function colorEditor(props: ModalProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const savedRange = useRef<Range | null>(null);
    const [mode, setMode] = useState<"foreground" | "background">("foreground");
    const [count, setCount] = useState(0);
    const [focused, setFocused] = useState(false);
    const [customColor, setCustomColor] = useState("#ff5555");
    const [gradientFrom, setGradientFrom] = useState("#ff9a56");
    const [gradientTo, setGradientTo] = useState("#c86b98");
    const [zebraFirst, setZebraFirst] = useState("#ffafaf");
    const [zebraSecond, setZebraSecond] = useState("#875f5f");

    const effects: effectEntry[] = [
        {
            name: "rainbow",
            css: "linear-gradient(90deg, #ff5f5f, #ffd75f, #87ff5f, #5fd7ff, #875fff, #ff5fd7)",
            colorAt: index => hueToHex((index * 40) % 360)
        },
        {
            name: "gradient",
            css: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
            colorAt: (index, total) => mixHex(gradientFrom, gradientTo, total > 1 ? index / (total - 1) : 0)
        },
        {
            name: "zebra",
            css: `repeating-linear-gradient(90deg, ${zebraFirst} 0px, ${zebraFirst} 12px, ${zebraSecond} 12px, ${zebraSecond} 24px)`,
            colorAt: index => snapHex(index % 2 === 0 ? zebraFirst : zebraSecond)
        }
    ];

    const refreshCount = () => {
        const editor = editorRef.current;
        if (editor) setCount(formatMessage(editor).length);
    };

    const saveSelection = () => {
        const editor = editorRef.current;
        const selection = window.getSelection();
        if (!editor || !selection || selection.rangeCount === 0) return;
        if (editor.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange();
    };

    const restoreSelection = () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        const selection = window.getSelection();
        if (selection && savedRange.current) {
            selection.removeAllRanges();
            selection.addRange(savedRange.current);
        }
    };

    const act = (action: () => void) => () => {
        restoreSelection();
        action();
        refreshCount();
        saveSelection();
    };

    const applyHex = (hex: string) => {
        runCommand(mode === "foreground" ? "foreColor" : "hiliteColor", hex);
    };

    const applyClassic = (entry: swatchEntry) => {
        applyHex(mode === "foreground" ? entry.hex : snapHex(entry.hex));
    };

    const applyEffect = (effect: effectEntry) => {
        const editor = editorRef.current;
        if (!editor) return;
        const text = selectedText(editor);
        if (!text) return;

        const characters = Array.from(text);
        const total = characters.filter(character => character !== "\n").length;
        const property = mode === "foreground" ? "color" : "background-color";
        let index = 0;
        let html = "";

        for (const character of characters) {
            if (character === "\n") {
                html += "<br>";
                continue;
            }
            html += `<span style="${property}:${effect.colorAt(index, total)}">${escapeHtml(character)}</span>`;
            index++;
        }

        document.execCommand("insertHTML", false, html);
    };

    const clearFormatting = () => {
        const editor = editorRef.current;
        if (!editor) return;
        if (!selectedText(editor)) document.execCommand("selectAll", false);
        const text = selectedText(editor);
        if (text) document.execCommand("insertHTML", false, plainToHtml(text));
    };

    const getMessage = () => {
        const editor = editorRef.current;
        return editor ? formatMessage(editor) : "";
    };

    const insertMessage = () => {
        const message = getMessage();
        if (!message) return;
        props.onClose();
        window.setTimeout(() => pasteIntoChat(message), 100);
    };

    const sendNow = () => {
        const message = getMessage();
        if (!message) return;
        props.onClose();

        window.setTimeout(() => {
            pasteIntoChat(message);

            window.setTimeout(() => {
                const box = findChatBox();
                if (!box) return;
                box.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                }));
            }, 150);
        }, 100);
    };

    const copyMessage = () => {
        const message = getMessage();
        if (message) navigator.clipboard.writeText(message);
    };

    const toolButton = (label: string, onClick: () => void, extraStyle: Record<string, string | number>, key: string) =>
        React.createElement("button", {
            key,
            type: "button",
            onClick,
            style: {
                padding: "8px 16px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
                fontFamily: "var(--font-code)",
                color: "#dcddde",
                backgroundColor: "#4e5058",
                ...extraStyle
            }
        }, label);

    const swatchButton = (entry: swatchEntry) =>
        React.createElement("button", {
            key: entry.name,
            type: "button",
            title: entry.name,
            onClick: act(() => applyClassic(entry)),
            style: {
                width: "36px",
                height: "32px",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor: entry.hex
            }
        });

    const effectButton = (effect: effectEntry) =>
        React.createElement("button", {
            key: effect.name,
            type: "button",
            title: effect.name,
            onClick: act(() => applyEffect(effect)),
            style: {
                width: "106px",
                height: "32px",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                background: effect.css
            }
        });

    const pickerInput = (value: string, onChange: (next: string) => void, width: string, title: string, height = "26px") =>
        React.createElement("input", {
            type: "color",
            value,
            title,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
            onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
            style: {
                width,
                height,
                padding: 0,
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor: "transparent"
            }
        });

    const effectColumn = (effect: effectEntry, pickers: React.ReactNode[]) =>
        React.createElement("div", {
            key: effect.name,
            style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }
        },
        effectButton(effect),
        pickers.length > 0
            ? React.createElement("div", { style: { display: "flex", gap: "4px" } }, ...pickers)
            : React.createElement("div", { style: { height: "26px" } })
        );

    const row = (label: string, children: React.ReactNode[]) =>
        React.createElement("div", {
            style: { display: "flex", alignItems: "flex-start", justifyContent: "center", marginBottom: "6px" }
        },
        React.createElement("span", {
            style: { width: "64px", textAlign: "right", marginRight: "12px", lineHeight: "32px", fontSize: "16px", fontWeight: 700, color: "#ffffff" }
        }, label),
        React.createElement("div", {
            style: { display: "flex", gap: "6px", width: "330px" }
        }, ...children));

    const modeButton = (label: string, value: "foreground" | "background") =>
        React.createElement("button", {
            key: value,
            type: "button",
            onClick: () => setMode(value),
            style: {
                padding: "8px 18px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: mode === value ? 700 : 500,
                color: mode === value ? "#ffffff" : "#dcddde",
                backgroundColor: mode === value ? "#5865f2" : "#4e5058"
            }
        }, label);

    const customApplyButton = React.createElement("button", {
        key: "customApply",
        type: "button",
        title: "Apply custom color",
        onClick: act(() => applyHex(snapHex(customColor))),
        style: {
            width: "162px",
            height: "32px",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontFamily: "var(--font-code)",
            fontSize: "13px",
            color: "#ffffff",
            textShadow: "0 0 3px #000000, 0 0 3px #000000",
            backgroundColor: customColor
        }
    }, "Apply");

    return React.createElement(ModalRoot, { ...props, size: ModalSize.MEDIUM },
        React.createElement(ModalHeader, null,
            React.createElement("span", {
                style: { flex: 1, textAlign: "center", fontSize: "24px", fontWeight: 700, color: "#ffffff" }
            }, "Create your text"),
            React.createElement(ModalCloseButton, { onClick: props.onClose })
        ),
        React.createElement(ModalContent, { style: { padding: "16px" } },
            React.createElement("div", {
                onMouseDown: (event: React.MouseEvent) => event.preventDefault()
            },
            React.createElement("div", {
                style: { display: "flex", justifyContent: "center", gap: "8px", marginBottom: "16px" }
            },
            toolButton("Clear", act(clearFormatting), {}, "clear"),
            toolButton("Bold", act(() => runCommand("bold")), { fontWeight: 700 }, "bold"),
            toolButton("Italic", act(() => runCommand("italic")), { fontStyle: "italic" }, "italic"),
            toolButton("Line", act(() => runCommand("underline")), { textDecoration: "underline" }, "line"),
            toolButton("Strike", act(() => runCommand("strikeThrough")), { textDecoration: "line-through" }, "strike")
            ),
            row("Classic", classicColors.map(swatchButton)),
            row("Custom", [
                pickerInput(customColor, setCustomColor, "162px", "Pick a custom color", "32px"),
                customApplyButton
            ]),
            row("Effects", [
                effectColumn(effects[0], []),
                effectColumn(effects[1], [
                    pickerInput(gradientFrom, setGradientFrom, "51px", "Gradient start"),
                    pickerInput(gradientTo, setGradientTo, "51px", "Gradient end")
                ]),
                effectColumn(effects[2], [
                    pickerInput(zebraFirst, setZebraFirst, "51px", "Zebra color one"),
                    pickerInput(zebraSecond, setZebraSecond, "51px", "Zebra color two")
                ])
            ]),
            React.createElement("div", {
                style: { display: "flex", justifyContent: "center", margin: "14px 0" }
            },
            React.createElement("div", {
                style: { display: "flex", gap: "2px", padding: "4px", borderRadius: "8px", backgroundColor: "#2b2d31" }
            }, modeButton("Foreground", "foreground"), modeButton("Background", "background"))
            )
            ),
            React.createElement("div", { style: { position: "relative" } },
                React.createElement("div", {
                    ref: editorRef,
                    contentEditable: true,
                    suppressContentEditableWarning: true,
                    spellCheck: false,
                    onInput: () => {
                        refreshCount();
                        saveSelection();
                    },
                    onKeyUp: saveSelection,
                    onMouseUp: saveSelection,
                    onFocus: () => setFocused(true),
                    onBlur: () => {
                        saveSelection();
                        setFocused(false);
                    },
                    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            document.execCommand("insertLineBreak", false);
                        }
                    },
                    onPaste: (event: React.ClipboardEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        const text = event.clipboardData.getData("text/plain");
                        document.execCommand("insertHTML", false, plainToHtml(text));
                    },
                    style: {
                        boxSizing: "border-box",
                        width: "100%",
                        minHeight: "220px",
                        padding: "12px 12px 28px",
                        borderRadius: "8px",
                        border: `2px solid ${focused ? "#4fd6c0" : "#2b2d31"}`,
                        outline: "none",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        fontFamily: "var(--font-code)",
                        fontSize: "14px",
                        fontWeight: 400,
                        color: baseTextColor,
                        backgroundColor: editorBackground
                    }
                }),
                React.createElement("span", {
                    style: {
                        position: "absolute",
                        right: "12px",
                        bottom: "8px",
                        fontSize: "11px",
                        fontFamily: "var(--font-code)",
                        color: count > 2000 ? "#ed4245" : "#8e9297",
                        pointerEvents: "none"
                    }
                }, `${count}/2000`)
            )
        ),
        React.createElement(ModalFooter, null,
            React.createElement("div", { style: { display: "flex", gap: "8px", justifyContent: "center", width: "100%" } },
                toolButton("Insert into message", insertMessage, { backgroundColor: "#5865f2", color: "#ffffff" }, "insert"),
                toolButton("Send now", sendNow, {}, "send"),
                toolButton("Copy as Discord formatted", copyMessage, {}, "copy")
            )
        )
    );
}

function openEditor() {
    openModal(modalProps => React.createElement(colorEditor, modalProps));
}

function paletteIcon() {
    return React.createElement("svg", {
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "currentColor"
    }, React.createElement("path", {
        d: "M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.4c2.8 0 5-2.2 5-5 0-4.4-4.5-6.5-8.4-6.5zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
    }));
}

function colorButton(props: { isMainChat: boolean }) {
    if (!props.isMainChat) return null;

    return React.createElement(ChatBarButton, {
        tooltip: "Colored Text",
        onClick: openEditor
    }, React.createElement(paletteIcon));
}

export default definePlugin({
    name: "AnsiColorMenu",
    description: "Rich editor for writing colored, bold, italic, underlined and struck-through text as Discord ANSI code blocks",
    authors: [{ name: "Tomany", id: 1340734096338325596n }],

    start() {
        addChatBarButton("ansiColorMenu", colorButton);
    },

    stop() {
        removeChatBarButton("ansiColorMenu");
    }
});