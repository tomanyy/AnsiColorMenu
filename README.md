# AnsiColorMenu

A Vencord plugin that adds a button to the chat bar. It opens a rich text editor where you can write colored, bold, italic, underlined and struck-through text, then insert it into your message as a Discord ANSI code block.

## Installation

You need a local build of Vencord from source. See the [Vencord custom plugin guide](https://docs.vencord.dev/installing/custom-plugins/).

```
git clone https://github.com/Vendicated/Vencord
cd Vencord/src
mkdir userplugins
cd userplugins
git clone https://github.com/tomanyy/AnsiColorMenu
cd ../..
pnpm install
pnpm build
pnpm inject
```

Restart Discord, then enable **AnsiColorMenu** in Settings, Vencord, Plugins.

## Usage

1. Click the palette icon in the chat bar.
2. Type your text and select the part you want to style.
3. Click a color, effect, or style button. The Foreground and Background switch decides where colors are applied.
4. Click **Insert into message** or **Copy as Discord formatted**.

## Limitations

- Discord only supports bold and underline in ANSI blocks. Italic uses Unicode sans-serif italic letters (A-Z and a-z only), and strikethrough adds a combining stroke after each character. Both depend on the font and use extra characters of your limit.
- ANSI colors render on desktop and web, not on mobile Discord.
- Custom and effect colors are limited to Discord's 256 color palette.

## Credits

Technique and original generator by [rebane2001](https://github.com/rebane2001).
