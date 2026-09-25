module.exports = {
  config: {
    updateChannel: "stable",

    fontSize: 16,
    fontFamily:
      "'FiraCode Nerd Font Mono Short76', 'FiraCode Nerd Font Mono', monospace",
    fontWeight: "normal",
    fontWeightBold: "bold",
    lineHeight: 1,
    letterSpacing: 0,

    cursorColor: "#9FB3C8",
    cursorAccentColor: "#212121",
    cursorShape: "UNDERLINE",
    cursorBlink: false,

    foregroundColor: "#E6E8EA",
    backgroundColor: "#212121",
    selectionColor: "rgba(79, 105, 128, 0.55)",
    borderColor: "#303030",

    css: `
      .hyper-command-cards-root {
        --hcc-user-ui-font-size: 14px;
      }
    `,
    termCSS: "",
    padding: "14px 28px",

    colors: {
      black: "#212121",
      red: "#E07878",
      green: "#8FBF88",
      yellow: "#D8B96E",
      blue: "#78A9D1",
      magenta: "#B89ACB",
      cyan: "#75B8B5",
      white: "#D6D9DC",
      lightBlack: "#70757A",
      lightRed: "#ED9292",
      lightGreen: "#A7CEA1",
      lightYellow: "#E4CA8A",
      lightBlue: "#94BCE0",
      lightMagenta: "#C9AFD8",
      lightCyan: "#91C9C7",
      lightWhite: "#F2F3F4",
    },

    shell: "",
    shellArgs: ["--login"],
    env: {},
    bell: false,
    copyOnSelect: false,
    defaultSSHApp: true,
    quickEdit: false,
    macOptionSelectionMode: "vertical",
    webGLRenderer: false,
  },

  plugins: [
  ],

  localPlugins: [
    "hyper-command-cards",
  ],

  keymaps: {},
};
