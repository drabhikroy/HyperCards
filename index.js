const BORDER_RADIUS = 14;
const OSC_ID = 777;

const CARD_SIDE_GAP = 8;
const VERTICAL_INSET = 4;

// Keep xterm's scrollbar gutter but use a fixed-size visual thumb.
const SCROLLBAR_RIGHT = 0;
const SCROLLBAR_WIDTH = 4;
const SCROLLBAR_TOP_GAP = 7;
const SCROLLBAR_BOTTOM_GAP = 7;
const SCROLLBAR_THUMB_HEIGHT = 36;
const SCROLLBAR_NATIVE_GUTTER = 12;
const SCROLLBAR_TRACK_COLOR = "transparent";
const SCROLLBAR_THUMB_COLOR = "rgba(170, 178, 186, 0.34)";

const OUTPUT_INDENT_COLUMNS = 2;
const OUTPUT_INDENT = `\x1b[${OUTPUT_INDENT_COLUMNS}C`;

const HCC_OUTPUT_MARKER = "\x1b]777;hcc;output\x07";
const HCC_DONE_MARKER = "\x1b]777;hcc;done\x07";
const HCC_PROMPT_MARKER = "\x1b]777;hcc;prompt\x07";

const HCC_MARKERS = [
  HCC_OUTPUT_MARKER,
  HCC_DONE_MARKER,
  HCC_PROMPT_MARKER,
];

const outputStates = new Map();

function getPartialMarkerSuffix(data) {
  let longest = "";

  for (const marker of HCC_MARKERS) {
    const maxLength = Math.min(
      marker.length - 1,
      data.length
    );

    for (
      let length = maxLength;
      length > 0;
      length--
    ) {
      const suffix =
        data.slice(-length);

      if (
        marker.startsWith(suffix) &&
        length > longest.length
      ) {
        longest = suffix;
        break;
      }
    }
  }

  return longest;
}

function indentOutput(
  data,
  state
) {
  let result = "";

  for (
    let i = 0;
    i < data.length;
    i++
  ) {
    const char = data[i];

    if (
      state.needsIndent &&
      char !== "\r" &&
      char !== "\n"
    ) {
      result += OUTPUT_INDENT;
      state.needsIndent = false;
    }

    result += char;

    if (
      char === "\r" ||
      char === "\n"
    ) {
      state.needsIndent = true;
    }
  }

  return result;
}

exports.middleware =
  () => (next) => (action) => {
    if (
      action.type !==
        "SESSION_PTY_DATA" ||
      typeof action.data !==
        "string"
    ) {
      return next(action);
    }

    const uid =
      action.uid ||
      "__default__";

    const state =
      outputStates.get(uid) || {
        active: false,
        needsIndent: false,
        pending: "",
      };

    let data =
      state.pending +
      action.data;

    state.pending = "";

    const partial =
      getPartialMarkerSuffix(
        data
      );

    if (partial) {
      state.pending =
        partial;

      data =
        data.slice(
          0,
          -partial.length
        );
    }

    let result = "";
    let position = 0;

    while (
      position <
      data.length
    ) {
      const candidates = [
        {
          marker:
            HCC_OUTPUT_MARKER,
          type: "output",
        },
        {
          marker:
            HCC_DONE_MARKER,
          type: "done",
        },
        {
          marker:
            HCC_PROMPT_MARKER,
          type: "prompt",
        },
      ]
        .map((item) => ({
          ...item,

          index:
            data.indexOf(
              item.marker,
              position
            ),
        }))
        .filter(
          (item) =>
            item.index !== -1
        )
        .sort(
          (a, b) =>
            a.index -
            b.index
        );

      if (
        !candidates.length
      ) {
        const remaining =
          data.slice(
            position
          );

        result +=
          state.active
            ? indentOutput(
                remaining,
                state
              )
            : remaining;

        break;
      }

      const nextMarker =
        candidates[0];

      const before =
        data.slice(
          position,
          nextMarker.index
        );

      result +=
        state.active
          ? indentOutput(
              before,
              state
            )
          : before;

      result +=
        nextMarker.marker;

      if (
        nextMarker.type ===
        "output"
      ) {
        state.active = true;
        state.needsIndent =
          true;
      } else {
        state.active = false;
        state.needsIndent =
          false;
      }

      position =
        nextMarker.index +
        nextMarker.marker
          .length;
    }

    if (
      !state.active &&
      !state.needsIndent &&
      !state.pending
    ) {
      outputStates.delete(
        uid
      );
    } else {
      outputStates.set(
        uid,
        state
      );
    }

    if (
      !result.length &&
      state.pending
    ) {
      return;
    }

    return next({
      ...action,
      data: result,
    });
  };

function findXterm(root) {
  const seen =
    new Set();

  const queue = [
    {
      value: root,
      depth: 0,
    },
  ];

  while (
    queue.length
  ) {
    const {
      value,
      depth,
    } = queue.shift();

    if (
      !value ||
      (
        typeof value !==
          "object" &&
        typeof value !==
          "function"
      ) ||
      seen.has(value)
    ) {
      continue;
    }

    seen.add(value);

    if (
      typeof value
        .registerMarker ===
        "function" &&
      typeof value
        .onResize ===
        "function" &&
      typeof value
        .onScroll ===
        "function"
    ) {
      return value;
    }

    if (
      depth >= 5
    ) {
      continue;
    }

    let properties = [];

    try {
      properties =
        Object.getOwnPropertyNames(
          value
        );
    } catch {
      continue;
    }

    for (
      const key
      of properties
    ) {
      let descriptor;

      try {
        descriptor =
          Object
            .getOwnPropertyDescriptor(
              value,
              key
            );
      } catch {
        continue;
      }

      if (
        !descriptor ||
        !(
          "value" in
          descriptor
        )
      ) {
        continue;
      }

      const child =
        descriptor.value;

      if (
        child &&
        (
          typeof child ===
            "object" ||
          typeof child ===
            "function"
        )
      ) {
        queue.push({
          value: child,
          depth:
            depth + 1,
        });
      }
    }
  }

  return null;
}

function registerOscHandler(
  xterm,
  callback
) {
  try {
    if (
      xterm.parser &&
      typeof xterm.parser
        .registerOscHandler ===
        "function"
    ) {
      return xterm.parser
        .registerOscHandler(
          OSC_ID,
          callback
        );
    }
  } catch {}

  try {
    if (
      xterm._core &&
      typeof xterm._core
        .registerOscHandler ===
        "function"
    ) {
      return xterm._core
        .registerOscHandler(
          OSC_ID,
          callback
        );
    }
  } catch {}

  try {
    if (
      xterm._core &&
      xterm._core
        ._inputHandler &&
      typeof xterm._core
        ._inputHandler
        .registerOscHandler ===
        "function"
    ) {
      return xterm._core
        ._inputHandler
        .registerOscHandler(
          OSC_ID,
          callback
        );
    }
  } catch {}

  return null;
}

function trimBlankLines(
  lines
) {
  const result =
    [...lines];

  while (
    result.length &&
    result[0].trim() ===
      ""
  ) {
    result.shift();
  }

  while (
    result.length &&
    result[
      result.length - 1
    ].trim() === ""
  ) {
    result.pop();
  }

  return result;
}

function readLogicalLines(
  xterm,
  startLine,
  endLineExclusive
) {
  const buffer =
    xterm.buffer.active;

  const result = [];

  for (
    let i = startLine;
    i <
    endLineExclusive;
    i++
  ) {
    const line =
      buffer.getLine(i);

    if (!line) {
      continue;
    }

    const text =
      line
        .translateToString(
          true
        );

    if (
      line.isWrapped &&
      result.length
    ) {
      result[
        result.length - 1
      ] += text;
    } else {
      result.push(text);
    }
  }

  return result;
}

function extractCommand(
  xterm,
  startMarker,
  outputMarker
) {
  if (
    !startMarker ||
    !outputMarker ||
    startMarker.isDisposed ||
    outputMarker.isDisposed
  ) {
    return "";
  }

  const lines = trimBlankLines(
    readLogicalLines(
      xterm,
      startMarker.line,
      outputMarker.line
    )
  );

  if (!lines.length) {
    return "";
  }

  const promptLine = lines.findIndex(
    (line) => line.includes("❯")
  );

  if (promptLine !== -1) {
    const firstLine = lines[promptLine];
    const promptIndex = firstLine.lastIndexOf("❯");

    lines[promptLine] =
      firstLine.slice(promptIndex + 1);

    return lines
      .slice(promptLine)
      .join("\n")
      .trim();
  }

  return lines.join("\n").trim();
}

function extractOutput(
  xterm,
  outputMarker,
  endMarker
) {
  if (
    !outputMarker ||
    !endMarker ||
    outputMarker
      .isDisposed ||
    endMarker
      .isDisposed
  ) {
    return "";
  }

  const pad =
    " ".repeat(
      OUTPUT_INDENT_COLUMNS
    );

  const lines =
    trimBlankLines(
      readLogicalLines(
        xterm,
        outputMarker.line,
        endMarker.line
      )
    ).map(
      (line) =>
        line.startsWith(
          pad
        )
          ? line.slice(
              pad.length
            )
          : line
    );

  return lines.join(
    "\n"
  );
}

async function writeClipboard(
  text
) {
  try {
    if (
      navigator
        .clipboard &&
      typeof navigator
        .clipboard
        .writeText ===
        "function"
    ) {
      await navigator
        .clipboard
        .writeText(text);

      return true;
    }
  } catch {}

  try {
    const {
      clipboard,
    } =
      require(
        "electron"
      );

    clipboard.writeText(
      text
    );

    return true;
  } catch {}

  try {
    const textarea =
      document
        .createElement(
          "textarea"
        );

    textarea.value =
      text;

    textarea.setAttribute(
      "aria-hidden",
      "true"
    );

    Object.assign(
      textarea.style,
      {
        position:
          "fixed",

        left:
          "-9999px",

        top:
          "0",

        opacity:
          "0",
      }
    );

    document.body
      .appendChild(
        textarea
      );

    textarea.select();

    const copied =
      document
        .execCommand(
          "copy"
        );

    textarea.remove();

    return copied;
  } catch {}

  return false;
}

function applyButtonBase(
  button
) {
  Object.assign(
    button.style,
    {
      appearance:
        "none",

      WebkitAppearance:
        "none",

      border:
        "0",

      margin:
        "0",

      background:
        "transparent",

      color:
        "#AAB2BA",

      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",

      fontSize:
        "10.5px",

      lineHeight:
        "16px",

      cursor:
        "pointer",

      outline:
        "none",
    }
  );

  button
    .addEventListener(
      "mouseenter",
      () => {
        if (
          !button.disabled
        ) {
          button.style.color =
            "#E6E8EA";

          button.style
            .background =
              "rgba(255, 255, 255, 0.055)";
        }
      }
    );

  button
    .addEventListener(
      "mouseleave",
      () => {
        if (
          !button.disabled
        ) {
          button.style.color =
            "#AAB2BA";

          button.style
            .background =
              "transparent";
        }
      }
    );

  button
    .addEventListener(
      "focus",
      () => {
        button.style
          .boxShadow =
            "inset 0 0 0 1px #95B8AE";
      }
    );

  button
    .addEventListener(
      "blur",
      () => {
        button.style
          .boxShadow =
            "none";
      }
    );
}

function createCopyControl(
  card
) {
  const control =
    document
      .createElement(
        "div"
      );

  Object.assign(
    control.style,
    {
      position:
        "relative",

      top:
        "0",

      right:
        "0",

      display:
        "flex",

      alignItems:
        "stretch",

      pointerEvents:
        "auto",

      background:
        "rgba(33, 33, 33, 0.88)",

      border:
        "1px solid #3D4850",

      borderRadius:
        "8px",

      boxShadow:
        "0 2px 8px rgba(0, 0, 0, 0.24)",

      overflow:
        "visible",

      zIndex:
        "30",
    }
  );

  const copyButton =
    document
      .createElement(
        "button"
      );

  copyButton.type =
    "button";

  copyButton
    .textContent =
      "Copy";

  copyButton.title =
    "Copy output";

  copyButton
    .setAttribute(
      "aria-label",
      "Copy output"
    );

  applyButtonBase(
    copyButton
  );

  Object.assign(
    copyButton.style,
    {
      padding:
        "1px 7px",

      borderRadius:
        "7px 0 0 7px",
    }
  );

  const menuButton =
    document
      .createElement(
        "button"
      );

  menuButton.type =
    "button";

  menuButton
    .textContent =
      "▼";

  menuButton.title =
    "Copy options";

  menuButton
    .setAttribute(
      "aria-label",
      "Copy options"
    );

  menuButton
    .setAttribute(
      "aria-haspopup",
      "menu"
    );

  menuButton
    .setAttribute(
      "aria-expanded",
      "false"
    );

  applyButtonBase(
    menuButton
  );

  Object.assign(
    menuButton.style,
    {
      minWidth:
        "22px",

      padding:
        "0 5px",

      display:
        "flex",

      alignItems:
        "center",

      justifyContent:
        "center",

      fontSize:
        "7px",

      lineHeight:
        "1",

      borderLeft:
        "1px solid #3D4850",

      borderRadius:
        "0 7px 7px 0",
    }
  );

  const menu =
    document
      .createElement(
        "div"
      );

  menu.className =
    "hcc-copy-menu";

  menu.dataset.open =
    "false";

  menu.setAttribute(
    "role",
    "menu"
  );

  menu.setAttribute(
    "aria-label",
    "Copy options"
  );

  Object.assign(
    menu.style,
    {
      position:
        "absolute",

      top:
        "25px",

      right:
        "0",

      display:
        "none",

      minWidth:
        "178px",

      padding:
        "4px",

      background:
        "#252A30",

      border:
        "1px solid #3D4850",

      borderRadius:
        "9px",

      boxShadow:
        "0 8px 24px rgba(0, 0, 0, 0.38)",

      zIndex:
        "40",
    }
  );

  let menuOpen =
    false;

  const setMenuOpen =
    (open) => {
      menuOpen = open;

      menu.style.display =
        open
          ? "block"
          : "none";

      menu.dataset.open =
        open
          ? "true"
          : "false";

      menuButton
        .setAttribute(
          "aria-expanded",
          open
            ? "true"
            : "false"
        );

      const items =
        menu.querySelectorAll(
          '[role="menuitem"]'
        );

      items.forEach(
        (item, index) => {
          item.tabIndex =
            open && index === 0
              ? 0
              : -1;
        }
      );
    };

  const focusMenuItem =
    (index) => {
      const items =
        Array.from(
          menu.querySelectorAll(
            '[role="menuitem"]'
          )
        );

      if (!items.length) {
        return;
      }

      const targetIndex =
        (
          index +
          items.length
        ) %
        items.length;

      items.forEach(
        (item) => {
          item.tabIndex =
            -1;
        }
      );

      items[targetIndex]
        .tabIndex =
          0;

      items[targetIndex]
        .focus();
    };

  const showCopied =
    (button) => {
      const original =
        button.dataset
          .originalLabel ||
        button.textContent;

      button.dataset
        .originalLabel =
          original;

      button.textContent =
        "Copied";

      button.style.color =
        "#8FBF88";

      if (
        button
          ._hccCopyTimer
      ) {
        clearTimeout(
          button
            ._hccCopyTimer
        );
      }

      button
        ._hccCopyTimer =
          setTimeout(
            () => {
              button.textContent =
                original;

              button.style.color =
                "#AAB2BA";
            },
            1100
          );
    };

  const copyKind =
    async (kind) => {
      let text = "";

      if (
        kind === "output"
      ) {
        text =
          card.copyOutput;
      }

      if (
        kind === "command"
      ) {
        text =
          card.copyCommand;
      }

      if (
        kind ===
          "command-output" &&
        typeof card.copyCombined ===
          "string"
      ) {
        text =
          card.copyCombined;
      } else if (
        kind ===
        "command-output"
      ) {
        text =
          card.copyCommand;

        if (
          card.copyOutput
        ) {
          text +=
            (
              text
                ? "\n"
                : ""
            ) +
            card.copyOutput;
        }
      }

      if (
        await writeClipboard(
          text
        )
      ) {
        showCopied(
          copyButton
        );
      }

      setMenuOpen(
        false
      );
    };

  copyButton
    .addEventListener(
      "click",
      (event) => {
        event
          .preventDefault();

        event
          .stopPropagation();

        copyKind(
          "output"
        );
      }
    );

  menuButton
    .addEventListener(
      "click",
      (event) => {
        event
          .preventDefault();

        event
          .stopPropagation();

        document
          .querySelectorAll(
            ".hcc-copy-menu[data-open='true']"
          )
          .forEach(
            (
              otherMenu
            ) => {
              if (
                otherMenu !==
                menu
              ) {
                otherMenu
                  .style
                  .display =
                    "none";

                otherMenu
                  .dataset
                  .open =
                    "false";

                if (
                  otherMenu
                    ._hccOwnerButton
                ) {
                  otherMenu
                    ._hccOwnerButton
                    .setAttribute(
                      "aria-expanded",
                      "false"
                    );
                }
              }
            }
          );

        const opening =
          !menuOpen;

        setMenuOpen(
          opening
        );

        if (
          opening &&
          event.detail === 0
        ) {
          requestAnimationFrame(
            () => {
              focusMenuItem(
                0
              );
            }
          );
        }
      }
    );

  menuButton
    .addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !==
            "ArrowDown" &&
          event.key !==
            "ArrowUp"
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        setMenuOpen(
          true
        );

        requestAnimationFrame(
          () => {
            focusMenuItem(
              event.key ===
                "ArrowUp"
                ? -1
                : 0
            );
          }
        );
      }
    );

  menu
    ._hccOwnerButton =
      menuButton;

  [
    [
      "Copy output",
      "output",
    ],
    [
      "Copy command",
      "command",
    ],
    [
      "Copy command + output",
      "command-output",
    ],
  ].forEach(
    (
      [
        label,
        kind,
      ]
    ) => {
      const button =
        document
          .createElement(
            "button"
          );

      button.type =
        "button";

      button.textContent =
        label;

      button.setAttribute(
        "role",
        "menuitem"
      );

      button.tabIndex =
        -1;

      applyButtonBase(
        button
      );

      Object.assign(
        button.style,
        {
          display:
            "block",

          width:
            "100%",

          padding:
            "5px 8px",

          borderRadius:
            "6px",

          textAlign:
            "left",

          whiteSpace:
            "nowrap",
        }
      );

      button
        .addEventListener(
          "click",
          (event) => {
            event
              .preventDefault();

            event
              .stopPropagation();

            copyKind(
              kind
            );
          }
        );

      menu.appendChild(
        button
      );
    }
  );

  menu.addEventListener(
    "click",
    (event) => {
      const item =
        event.target.closest?.(
          '[role="menuitem"]'
        );

      if (
        !item ||
        !menu.contains(
          item
        )
      ) {
        return;
      }

      requestAnimationFrame(
        () => {
          menuButton.focus();
        }
      );
    }
  );

  control
    .addEventListener(
      "keydown",
      (event) => {
        if (
          event.key ===
          "Escape"
        ) {
          if (!menuOpen) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          setMenuOpen(
            false
          );

          menuButton
            .focus();

          return;
        }

        if (!menuOpen) {
          return;
        }

        const items =
          Array.from(
            menu.querySelectorAll(
              '[role="menuitem"]'
            )
          );

        if (!items.length) {
          return;
        }

        const current =
          items.indexOf(
            document.activeElement
          );

        if (
          event.key ===
          "ArrowDown"
        ) {
          event.preventDefault();
          event.stopPropagation();

          focusMenuItem(
            current < 0
              ? 0
              : current + 1
          );

          return;
        }

        if (
          event.key ===
          "ArrowUp"
        ) {
          event.preventDefault();
          event.stopPropagation();

          focusMenuItem(
            current < 0
              ? -1
              : current - 1
          );

          return;
        }

        if (
          event.key ===
          "Home"
        ) {
          event.preventDefault();
          event.stopPropagation();

          focusMenuItem(
            0
          );

          return;
        }

        if (
          event.key ===
          "End"
        ) {
          event.preventDefault();
          event.stopPropagation();

          focusMenuItem(
            -1
          );
        }
      }
    );

  control
    .addEventListener(
      "focusout",
      () => {
        setTimeout(
          () => {
            if (
              !control
                .contains(
                  document
                    .activeElement
                )
            ) {
              setMenuOpen(
                false
              );
            }
          },
          0
        );
      }
    );

  control.appendChild(
    copyButton
  );

  control.appendChild(
    menuButton
  );

  control.appendChild(
    menu
  );

  return control;
}

function createCollapseControl(
  card
) {
  const control =
    document
      .createElement(
        "div"
      );

  Object.assign(
    control.style,
    {
      position:
        "relative",

      display:
        "flex",

      alignItems:
        "stretch",

      pointerEvents:
        "auto",

      background:
        "rgba(33, 33, 33, 0.88)",

      border:
        "1px solid #3D4850",

      borderRadius:
        "8px",

      boxShadow:
        "0 2px 8px rgba(0, 0, 0, 0.24)",

      overflow:
        "hidden",
    }
  );

  const button =
    document
      .createElement(
        "button"
      );

  button.type =
    "button";

  button.textContent =
    "−";

  button.title =
    "Collapse card";

  button.setAttribute(
    "aria-label",
    "Collapse card"
  );

  button.setAttribute(
    "aria-expanded",
    "true"
  );

  applyButtonBase(
    button
  );

  Object.assign(
    button.style,
    {
      minWidth:
        "24px",

      padding:
        "1px 6px",

      borderRadius:
        "7px",

      fontSize:
        "14px",

      lineHeight:
        "16px",
    }
  );

  button.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        typeof card
          .setCollapsed ===
          "function"
      ) {
        card.setCollapsed(
          !card.collapsed
        );
      }
    }
  );

  control.appendChild(
    button
  );

  control.button =
    button;

  return control;
}

exports.decorateKeymaps =
  (keymaps) => {
    const command =
      "hyper-command-cards:history";

    if (
      Object.prototype.hasOwnProperty.call(
        keymaps,
        command
      )
    ) {
      return keymaps;
    }

    return Object.assign(
      {},
      keymaps,
      {
        [command]:
          "command+r",
      }
    );
  };

exports.decorateTerms =
  (
    Terms,
    {
      React,
    }
  ) => {
    return class CommandCardsTerms
      extends React.Component {
      constructor(props) {
        super(props);

        this.terms =
          null;

        this.registeredTerms =
          null;

        this.onDecorated =
          this.onDecorated
            .bind(this);
      }

      onDecorated(
        terms
      ) {
        this.terms =
          terms;

        if (
          terms &&
          terms !==
            this.registeredTerms &&
          typeof terms
            .registerCommands ===
            "function"
        ) {
          terms.registerCommands(
            {
              "hyper-command-cards:history":
                (event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  const activeTerm =
                    terms &&
                    typeof terms
                      .getActiveTerm ===
                      "function"
                      ? terms.getActiveTerm()
                      : null;

                  if (
                    !activeTerm ||
                    !activeTerm.props ||
                    typeof activeTerm
                      .props
                      .onData !==
                      "function"
                  ) {
                    return;
                  }

                  if (
                    typeof activeTerm
                      .focus ===
                      "function"
                  ) {
                    activeTerm.focus();
                  }

                  activeTerm.props.onData(
                    "\x07"
                  );
                },

              "hyper-command-cards:focus-controls":
                (event) => {
                  event.preventDefault();

                  const active =
                    document.activeElement;

                  let root =
                    active &&
                    typeof active.closest ===
                      "function"
                      ? active.closest(
                          ".hyper-command-cards-root"
                        )
                      : null;

                  if (!root) {
                    root =
                      Array.from(
                        document.querySelectorAll(
                          ".hyper-command-cards-root"
                        )
                      ).find(
                        (element) =>
                          element.offsetParent !==
                          null
                      ) ||
                      null;
                  }

                  if (!root) {
                    return;
                  }

                  const buttons =
                    root.querySelectorAll(
                      'button[aria-label="Copy output"]'
                    );

                  const button =
                    buttons[
                      buttons.length - 1
                    ];

                  if (button) {
                    button.focus();
                  }
                },
            }
          );

          this.registeredTerms =
            terms;
        }

        if (
          this.props
            .onDecorated
        ) {
          this.props
            .onDecorated(
              terms
            );
        }
      }

      render() {
        return React.createElement(
          Terms,
          Object.assign(
            {},
            this.props,
            {
              onDecorated:
                this.onDecorated,
            }
          )
        );
      }
    };
  };

exports.decorateTerm =
  (
    Term,
    {
      React,
    }
  ) => {
    return class CommandCards
      extends React.Component {
      constructor(props) {
        super(props);

        this.wrapper =
          null;

        this.overlay =
          null;

        this.cardLayer =
          null;

        this.stickyCopyCard =
          null;

        this.scrollbarTrack =
          null;

        this.scrollbarThumb =
          null;

        this.hyperTerm =
          null;

        this.xterm =
          null;

        this.startMarker =
          null;

        this.outputMarker =
          null;

        this.cards =
          [];

        this.selectedCards =
          new Set();

        this.bulkBar =
          null;

        this.searchBar =
          null;

        this.searchInput =
          null;

        this.searchCount =
          null;

        this.searchQuery =
          "";

        this.pendingGroup =
          null;

        this.commandStartedAt =
          null;

        this.finishTimer =
          null;

        this.commandGroups =
          new Map();

        this.oscHandler =
          null;

        this.clearScreenHandler =
          null;

        this.redrawHandlers =
          [];

        this.liveRedrawActive =
          false;

        this.resizeHandler =
          null;

        this.scrollHandler =
          null;

        this.renderHandler =
          null;

        this.retryTimer =
          null;

        this.geometryFrame =
          null;

        this.cellHeight =
          0;

        this.screenTop =
          0;

        this.viewportY =
          0;

        this.setWrapper =
          this.setWrapper
            .bind(this);

        this.setOverlay =
          this.setOverlay
            .bind(this);

        this.setCardLayer =
          this.setCardLayer
            .bind(this);

        this.setScrollbarTrack =
          this.setScrollbarTrack
            .bind(this);

        this.setScrollbarThumb =
          this.setScrollbarThumb
            .bind(this);

        this.onDecorated =
          this.onDecorated
            .bind(this);

        this.findTerminal =
          this.findTerminal
            .bind(this);

        this.handleOsc =
          this.handleOsc
            .bind(this);

        this.setLiveRedraw =
          this.setLiveRedraw
            .bind(this);

        this.updateLayerTransform =
          this
            .updateLayerTransform
            .bind(this);

        this.scheduleGeometryUpdate =
          this
            .scheduleGeometryUpdate
            .bind(this);

        this.updateGeometry =
          this.updateGeometry
            .bind(this);

        this.handleCardControlKeyDown =
          this.handleCardControlKeyDown
            .bind(this);
      }

      componentWillUnmount() {
        if (this.wrapper) {
          this.wrapper.removeEventListener(
            "keydown",
            this.handleCardControlKeyDown
          );
        }

        if (
          this.retryTimer
        ) {
          clearTimeout(
            this.retryTimer
          );
        }

        if (
          this.geometryFrame
        ) {
          cancelAnimationFrame(
            this.geometryFrame
          );
        }

        if (
          this.stickyCopyCard &&
          this.stickyCopyCard
            .controls
        ) {
          try {
            this.stickyCopyCard
              .controls
              .remove();
          } catch {}

          this.stickyCopyCard =
            null;
        }

        for (
          const disposable
          of [
            this
              .oscHandler,

            this
              .clearScreenHandler,

            ...this
              .redrawHandlers,

            this
              .resizeHandler,

            this
              .scrollHandler,

            this
              .renderHandler,
          ]
        ) {
          try {
            if (
              disposable &&
              typeof disposable
                .dispose ===
                "function"
            ) {
              disposable
                .dispose();
            }
          } catch {}
        }

        for (
          const card
          of this.cards
        ) {
          try {
            card.element
              .remove();
          } catch {}

          try {
            card.start
              .dispose();
          } catch {}

          try {
            if (
              card.output &&
              !card.output
                .isDisposed
            ) {
              card.output
                .dispose();
            }
          } catch {}

          try {
            card.end
              .dispose();
          } catch {}
        }

        try {
          if (
            this.startMarker &&
            !this.startMarker
              .isDisposed
          ) {
            this.startMarker
              .dispose();
          }
        } catch {}

        try {
          if (
            this.outputMarker &&
            !this.outputMarker
              .isDisposed
          ) {
            this.outputMarker
              .dispose();
          }
        } catch {}
      }

      setWrapper(
        element
      ) {
        if (this.wrapper) {
          this.wrapper.removeEventListener(
            "keydown",
            this.handleCardControlKeyDown
          );
        }

        this.wrapper =
          element;

        if (this.wrapper) {
          this.wrapper.addEventListener(
            "keydown",
            this.handleCardControlKeyDown
          );
        }
      }

      handleCardControlKeyDown(
        event
      ) {
        if (
          event.metaKey &&
          event.shiftKey &&
          !event.altKey &&
          !event.ctrlKey &&
          String(
            event.key
          ).toLowerCase() ===
            "f"
        ) {
          event.preventDefault();
          event.stopPropagation();

          this
            .openCardSearch();

          return;
        }

        if (
          event.key ===
            "Escape" &&
          this.searchBar &&
          this.searchBar.style
            .display !==
            "none"
        ) {
          event.preventDefault();
          event.stopPropagation();

          this
            .closeCardSearch();

          return;
        }

        if (
          event.key ===
            "Escape" &&
          this.selectedCards
            .size
        ) {
          event.preventDefault();
          event.stopPropagation();

          this
            .clearCardSelection();

          if (
            this.xterm &&
            typeof this.xterm.focus ===
              "function"
          ) {
            this.xterm.focus();
          }

          return;
        }

        const card =
          this.cards.find(
            (item) =>
              item.controls &&
              item.controls.contains(
                event.target
              )
          );

        if (!card) {
          return;
        }

        if (
          event.key ===
          "Escape"
        ) {
          event.preventDefault();
          event.stopPropagation();

          if (
            this.xterm &&
            typeof this.xterm.focus ===
              "function"
          ) {
            this.xterm.focus();
          }

          return;
        }

        if (
          event.key !==
          "Tab"
        ) {
          return;
        }

        const copyButtons =
          card.copyControl
            ? Array.from(
                card.copyControl.children
              ).filter(
                (element) =>
                  element.tagName ===
                  "BUTTON"
              )
            : [];

        const buttons =
          [
            card.selectButton,
            ...copyButtons,
            card.collapseControl &&
              card.collapseControl.button,
          ].filter(
            (button) =>
              button &&
              button.isConnected &&
              !button.disabled
          );

        const current =
          buttons.indexOf(
            event.target
          );

        if (
          current === -1 ||
          !buttons.length
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const direction =
          event.shiftKey
            ? -1
            : 1;

        const next =
          (
            current +
            direction +
            buttons.length
          ) %
          buttons.length;

        buttons[next].focus();
      }


      ensureSearchPromptShade() {
        if (
          this.searchPromptShade &&
          this.searchPromptShade
            .isConnected
        ) {
          return this.searchPromptShade;
        }

        if (!this.cardLayer) {
          return null;
        }

        const shade =
          document
            .createElement(
              "div"
            );

        Object.assign(
          shade.style,
          {
            position:
              "absolute",

            left:
              "0",

            right:
              "0",

            display:
              "none",

            background:
              "rgba(33, 33, 33, 0.38)",

            pointerEvents:
              "none",

            zIndex:
              "20",
          }
        );

        this.cardLayer
          .appendChild(
            shade
          );

        this.searchPromptShade =
          shade;

        return shade;
      }

      updateSearchPromptShade(
        visible
      ) {
        const shade =
          this
            .ensureSearchPromptShade();

        if (
          !shade ||
          !visible ||
          !this.xterm ||
          !this.startMarker ||
          this.startMarker
            .isDisposed ||
          !this.cellHeight
        ) {
          if (shade) {
            shade.style.display =
              "none";
          }

          return;
        }

        const buffer =
          this.xterm
            .buffer
            .active;

        const cursorLine =
          (buffer.baseY || 0) +
          (buffer.cursorY || 0);

        const startLine =
          this.startMarker.line;

        if (
          startLine >
          cursorLine
        ) {
          shade.style.display =
            "none";

          return;
        }

        const rows =
          Math.max(
            1,
            cursorLine -
              startLine +
              1
          );

        Object.assign(
          shade.style,
          {
            display:
              "block",

            top:
              `${
                this.screenTop +
                startLine *
                  this.cellHeight
              }px`,

            height:
              `${
                rows *
                this.cellHeight
              }px`,
          }
        );
      }

      ensureCardSearch() {
        if (
          this.searchBar &&
          this.searchBar.isConnected
        ) {
          return this.searchBar;
        }

        if (!this.overlay) {
          return null;
        }

        const bar =
          document
            .createElement(
              "div"
            );

        bar.className =
          "hcc-card-search";

        bar.setAttribute(
          "role",
          "search"
        );

        bar.setAttribute(
          "aria-label",
          "Search Hyper Cards"
        );

        Object.assign(
          bar.style,
          {
            position:
              "absolute",

            top:
              "10px",

            right:
              "16px",

            display:
              "none",

            alignItems:
              "center",

            gap:
              "7px",

            padding:
              "5px 6px 5px 9px",

            background:
              "rgba(33, 33, 33, 0.97)",

            border:
              "1px solid #3D4850",

            borderRadius:
              "10px",

            boxShadow:
              "0 6px 20px rgba(0, 0, 0, 0.34)",

            pointerEvents:
              "auto",

            zIndex:
              "50",
          }
        );

        const label =
          document
            .createElement(
              "span"
            );

        label.textContent =
          "Search cards";

        Object.assign(
          label.style,
          {
            color:
              "#D8DDE2",

            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",

            fontSize:
              "10.5px",

            fontWeight:
              "600",

            whiteSpace:
              "nowrap",
          }
        );

        const input =
          document
            .createElement(
              "input"
            );

        input.type =
          "search";

        input.placeholder =
          "Search commands and output";

        input.setAttribute(
          "aria-label",
          "Search commands and output"
        );

        Object.assign(
          input.style,
          {
            width:
              "230px",

            minWidth:
              "120px",

            padding:
              "4px 7px",

            border:
              "1px solid #4A555E",

            borderRadius:
              "7px",

            background:
              "#191C20",

            color:
              "#E6E8EA",

            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",

            fontSize:
              "11px",

            lineHeight:
              "16px",

            outline:
              "none",
          }
        );

        const count =
          document
            .createElement(
              "span"
            );

        count.setAttribute(
          "aria-live",
          "polite"
        );

        Object.assign(
          count.style,
          {
            minWidth:
              "62px",

            color:
              "#AAB2BA",

            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",

            fontSize:
              "10.5px",

            textAlign:
              "right",

            whiteSpace:
              "nowrap",
          }
        );

        const close =
          document
            .createElement(
              "button"
            );

        close.type =
          "button";

        close.textContent =
          "Close";

        close.title =
          "Close card search";

        close.setAttribute(
          "aria-label",
          "Close card search"
        );

        applyButtonBase(
          close
        );

        Object.assign(
          close.style,
          {
            padding:
              "3px 6px",

            borderRadius:
              "7px",
          }
        );

        input.addEventListener(
          "input",
          () => {
            this
              .updateCardSearch(
                input.value
              );
          }
        );

        input.addEventListener(
          "focus",
          () => {
            input.style
              .borderColor =
                "#95B8AE";
          }
        );

        input.addEventListener(
          "blur",
          () => {
            input.style
              .borderColor =
                "#4A555E";
          }
        );

        close.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            event.stopPropagation();

            this
              .closeCardSearch();
          }
        );

        bar.appendChild(
          label
        );

        bar.appendChild(
          input
        );

        bar.appendChild(
          count
        );

        bar.appendChild(
          close
        );

        this.overlay
          .appendChild(
            bar
          );

        this.searchBar =
          bar;

        this.searchInput =
          input;

        this.searchCount =
          count;

        return bar;
      }

      openCardSearch() {
        const bar =
          this
            .ensureCardSearch();

        if (!bar) {
          return;
        }

        bar.style.display =
          "flex";

        this.searchInput.value =
          "";

        this
          .updateCardSearch(
            ""
          );

        requestAnimationFrame(
          () => {
            this.searchInput
              .focus();

            this.searchInput
              .select();
          }
        );
      }

      closeCardSearch(
        focusTerminal = true
      ) {
        this.searchQuery =
          "";

        if (
          this.searchInput
        ) {
          this.searchInput.value =
            "";
        }

        if (
          this.searchBar
        ) {
          this.searchBar
            .style
            .display =
              "none";
        }

        for (
          const card
          of this.cards
        ) {
          if (
            card.element &&
            card.element
              .isConnected
          ) {
            card.element
              .style
              .opacity =
                "1";

            card.element
              .style
              .filter =
                "none";

            card.element
              .style
              .outline =
                "none";

            card.element
              .style
              .boxShadow =
                "";

            if (
              card.controls
            ) {
              card.controls
                .style
                .opacity =
                  "1";
            }

            if (
              card.searchShade
            ) {
              card.searchShade
                .style
                .display =
                  "none";
            }
          }
        }

        for (
          const group
          of this.commandGroups
            .values()
        ) {
          if (
            group.header
          ) {
            group.header
              .style
              .opacity =
                "1";
          }

          if (
            group.rail
          ) {
            group.rail
              .style
              .opacity =
                "1";
          }
        }

        this
          .updateSearchPromptShade(
            false
          );

        if (
          focusTerminal &&
          this.xterm &&
          typeof this.xterm
            .focus ===
            "function"
        ) {
          this.xterm.focus();
        }
      }

      updateCardSearch(
        query
      ) {
        const normalized =
          String(
            query || ""
          )
            .trim()
            .toLocaleLowerCase();

        this.searchQuery =
          normalized;

        const cards =
          this.cards
            .filter(
              (card) =>
                card.element &&
                card.element
                  .isConnected
            );

        let matches =
          0;

        for (
          const card
          of cards
        ) {
          const content =
            [
              card.copyCommand ||
                "",
              card.copyOutput ||
                "",
            ]
              .join(
                "\n"
              )
              .toLocaleLowerCase();

          const match =
            !normalized ||
            content.includes(
              normalized
            );

          card.searchMatch =
            match;

          if (
            normalized &&
            match
          ) {
            matches += 1;
          }

          const dimmed =
            normalized &&
            !match;

          if (
            !card.searchShade
          ) {
            const shade =
              document
                .createElement(
                  "div"
                );

            Object.assign(
              shade.style,
              {
                position:
                  "absolute",

                inset:
                  "0",

                display:
                  "none",

                background:
                  "rgba(33, 33, 33, 0.38)",

                borderRadius:
                  `${BORDER_RADIUS}px`,

                pointerEvents:
                  "none",

                zIndex:
                  "20",
              }
            );

            card.element
              .appendChild(
                shade
              );

            card.searchShade =
              shade;
          }

          card.element
            .style
            .opacity =
              "1";

          card.element
            .style
            .filter =
              dimmed
                ? "none"
                : "none";

          card.searchShade
            .style
            .display =
              dimmed
                ? "block"
                : "none";

          card.element
            .style
            .outline =
              normalized &&
              match
                ? "2px solid rgba(149, 184, 174, 0.78)"
                : "none";

          card.element
            .style
            .outlineOffset =
              "-2px";

          card.element
            .style
            .boxShadow =
              normalized &&
              match
                ? "0 0 0 1px rgba(149, 184, 174, 0.16)"
                : "";

          if (
            card.controls
          ) {
            card.controls
              .style
              .opacity =
                dimmed
                  ? "0.38"
                  : "1";
          }
        }

        for (
          const group
          of this.commandGroups
            .values()
        ) {
          const groupMatches =
            !normalized ||
            group.cards.some(
              (card) =>
                card.searchMatch
            );

          const opacity =
            normalized &&
            !groupMatches
              ? "0.38"
              : "1";

          if (
            group.header
          ) {
            group.header
              .style
              .opacity =
                opacity;
          }

          if (
            group.rail
          ) {
            group.rail
              .style
              .opacity =
                opacity;
          }
        }

        this
          .updateSearchPromptShade(
            Boolean(
              normalized
            )
          );

        if (
          this.searchCount
        ) {
          if (!normalized) {
            this.searchCount
              .textContent =
                `${cards.length} ${
                  cards.length === 1
                    ? "card"
                    : "cards"
                }`;
          } else {
            this.searchCount
              .textContent =
                `${matches} ${
                  matches === 1
                    ? "match"
                    : "matches"
                }`;
          }
        }
      }

      getSelectedCards() {
        return this.cards
          .filter(
            (card) =>
              this.selectedCards
                .has(card) &&
              card.element &&
              card.element
                .isConnected
          );
      }

      clearCardSelection() {
        this.selectedCards
          .clear();

        this
          .updateSelectionUi();
      }

      toggleCardSelection(
        card
      ) {
        if (
          this.selectedCards
            .has(card)
        ) {
          this.selectedCards
            .delete(card);
        } else {
          this.selectedCards
            .add(card);
        }

        this
          .updateSelectionUi();
      }

      async copySelectedCards(
        kind
      ) {
        const cards =
          this
            .getSelectedCards();

        if (!cards.length) {
          return;
        }

        let text = "";

        if (
          kind ===
          "output"
        ) {
          text =
            cards
              .map(
                (card) =>
                  card.copyOutput ||
                  ""
              )
              .join(
                "\n\n"
              );
        }

        if (
          kind ===
          "command"
        ) {
          text =
            cards
              .map(
                (card) =>
                  card.copyCommand ||
                  ""
              )
              .filter(Boolean)
              .join(
                "\n"
              );
        }

        if (
          kind ===
          "command-output"
        ) {
          text =
            cards
              .map(
                (card) => {
                  const parts =
                    [];

                  if (
                    card.copyCommand
                  ) {
                    parts.push(
                      card.copyCommand
                    );
                  }

                  if (
                    card.copyOutput
                  ) {
                    parts.push(
                      card.copyOutput
                    );
                  }

                  return parts
                    .join(
                      "\n"
                    );
                }
              )
              .filter(Boolean)
              .join(
                "\n\n"
              );
        }

        if (
          await writeClipboard(
            text
          )
        ) {
          this
            .clearCardSelection();
        }
      }

      ensureBulkBar() {
        if (
          this.bulkBar &&
          this.bulkBar
            .isConnected
        ) {
          return this.bulkBar;
        }

        if (!this.overlay) {
          return null;
        }

        const bar =
          document
            .createElement(
              "div"
            );

        Object.assign(
          bar.style,
          {
            position:
              "absolute",

            top:
              "8px",

            left:
              "50%",

            transform:
              "translateX(-50%)",

            display:
              "none",

            alignItems:
              "center",

            gap:
              "6px",

            padding:
              "4px 5px 4px 9px",

            background:
              "rgba(33, 33, 33, 0.96)",

            border:
              "1px solid #3D4850",

            borderRadius:
              "9px",

            boxShadow:
              "0 4px 14px rgba(0, 0, 0, 0.32)",

            pointerEvents:
              "auto",

            zIndex:
              "90",
          }
        );

        const count =
          document
            .createElement(
              "span"
            );

        Object.assign(
          count.style,
          {
            color:
              "#AAB2BA",

            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",

            fontSize:
              "10.5px",

            lineHeight:
              "20px",

            whiteSpace:
              "nowrap",
          }
        );

        const copyGroup =
          document
            .createElement(
              "div"
            );

        Object.assign(
          copyGroup.style,
          {
            position:
              "relative",

            display:
              "flex",

            alignItems:
              "stretch",

            border:
              "1px solid #3D4850",

            borderRadius:
              "8px",

            overflow:
              "visible",
          }
        );

        const copyButton =
          document
            .createElement(
              "button"
            );

        copyButton.type =
          "button";

        copyButton.textContent =
          "Copy";

        copyButton.title =
          "Copy selected output";

        copyButton
          .setAttribute(
            "aria-label",
            "Copy selected output"
          );

        applyButtonBase(
          copyButton
        );

        Object.assign(
          copyButton.style,
          {
            padding:
              "1px 7px",

            borderRadius:
              "7px 0 0 7px",
          }
        );

        const menuButton =
          document
            .createElement(
              "button"
            );

        menuButton.type =
          "button";

        menuButton.textContent =
          "▼";

        menuButton.title =
          "Copy selected options";

        menuButton
          .setAttribute(
            "aria-label",
            "Copy selected options"
          );

        menuButton
          .setAttribute(
            "aria-haspopup",
            "menu"
          );

        menuButton
          .setAttribute(
            "aria-expanded",
            "false"
          );

        applyButtonBase(
          menuButton
        );

        Object.assign(
          menuButton.style,
          {
            minWidth:
              "22px",

            padding:
              "0 5px",

            fontSize:
              "7px",

            borderLeft:
              "1px solid #3D4850",

            borderRadius:
              "0 7px 7px 0",
          }
        );

        const menu =
          document
            .createElement(
              "div"
            );

        menu.setAttribute(
          "role",
          "menu"
        );

        menu.setAttribute(
          "aria-label",
          "Copy selected options"
        );

        Object.assign(
          menu.style,
          {
            position:
              "absolute",

            top:
              "28px",

            right:
              "0",

            display:
              "none",

            minWidth:
              "178px",

            padding:
              "4px",

            background:
              "#252A30",

            border:
              "1px solid #3D4850",

            borderRadius:
              "9px",

            boxShadow:
              "0 8px 24px rgba(0, 0, 0, 0.38)",

            zIndex:
              "100",
          }
        );

        const closeMenu =
          () => {
            menu.style.display =
              "none";

            menuButton
              .setAttribute(
                "aria-expanded",
                "false"
              );
          };

        const options = [
          [
            "Copy output",
            "output",
          ],
          [
            "Copy command",
            "command",
          ],
          [
            "Copy command + output",
            "command-output",
          ],
        ];

        for (
          const [
            label,
            kind,
          ]
          of options
        ) {
          const item =
            document
              .createElement(
                "button"
              );

          item.type =
            "button";

          item.textContent =
            label;

          item.setAttribute(
            "role",
            "menuitem"
          );

          applyButtonBase(
            item
          );

          Object.assign(
            item.style,
            {
              display:
                "block",

              width:
                "100%",

              padding:
                "5px 7px",

              textAlign:
                "left",

              borderRadius:
                "6px",
            }
          );

          item
            .addEventListener(
              "click",
              async (event) => {
                event
                  .preventDefault();

                event
                  .stopPropagation();

                closeMenu();

                await this
                  .copySelectedCards(
                    kind
                  );
              }
            );

          menu.appendChild(
            item
          );
        }

        copyButton
          .addEventListener(
            "click",
            async (event) => {
              event
                .preventDefault();

              event
                .stopPropagation();

              await this
                .copySelectedCards(
                  "output"
                );
            }
          );

        menuButton
          .addEventListener(
            "click",
            (event) => {
              event
                .preventDefault();

              event
                .stopPropagation();

              const open =
                menu.style
                  .display ===
                "block";

              menu.style.display =
                open
                  ? "none"
                  : "block";

              menuButton
                .setAttribute(
                  "aria-expanded",
                  open
                    ? "false"
                    : "true"
                );
            }
          );

        const cancelButton =
          document
            .createElement(
              "button"
            );

        cancelButton.type =
          "button";

        cancelButton.textContent =
          "Cancel";

        cancelButton.title =
          "Cancel card selection";

        cancelButton
          .setAttribute(
            "aria-label",
            "Cancel card selection"
          );

        applyButtonBase(
          cancelButton
        );

        Object.assign(
          cancelButton.style,
          {
            padding:
              "1px 6px",

            borderRadius:
              "7px",
          }
        );

        cancelButton
          .addEventListener(
            "click",
            (event) => {
              event
                .preventDefault();

              event
                .stopPropagation();

              this
                .clearCardSelection();
            }
          );

        copyGroup.appendChild(
          copyButton
        );

        copyGroup.appendChild(
          menuButton
        );

        copyGroup.appendChild(
          menu
        );

        bar.appendChild(
          count
        );

        bar.appendChild(
          copyGroup
        );

        bar.appendChild(
          cancelButton
        );

        bar._hccCount =
          count;

        bar._hccMenu =
          menu;

        bar._hccMenuButton =
          menuButton;

        this.overlay
          .appendChild(
            bar
          );

        this.bulkBar =
          bar;

        return bar;
      }

      updateSelectionUi() {
        const liveCards =
          this.cards
            .filter(
              (card) =>
                this.selectedCards
                  .has(card) &&
                card.element &&
                card.element
                  .isConnected
            );

        this.selectedCards =
          new Set(
            liveCards
          );

        const selectionActive =
          this.selectedCards
            .size > 0;

        for (
          const card
          of this.cards
        ) {
          const selected =
            this.selectedCards
              .has(card);

          if (
            card.selectButton
          ) {
            card.selectButton
              .textContent =
                selected
                  ? "✓"
                  : "○";

            card.selectButton
              .setAttribute(
                "aria-pressed",
                selected
                  ? "true"
                  : "false"
              );

            card.selectButton
              .title =
                selected
                  ? "Deselect card"
                  : "Select card";

            card.selectButton
              .style
              .color =
                selected
                  ? "#DCEBE6"
                  : "#AAB2BA";

            const hovered =
              card.controls &&
              card.controls
                .matches(
                  ":hover"
                );

            card.selectButton
              .style
              .opacity =
                "1";
          }

          if (
            card.collapsedShell
          ) {
            card.collapsedShell
              .style
              .borderColor =
                selected
                  ? "#95B8AE"
                  : "#3D4850";
          }
        }

        if (!selectionActive) {
          if (this.bulkBar) {
            this.bulkBar
              .style
              .display =
                "none";

            if (
              this.bulkBar
                ._hccMenu
            ) {
              this.bulkBar
                ._hccMenu
                .style
                .display =
                  "none";
            }

            if (
              this.bulkBar
                ._hccMenuButton
            ) {
              this.bulkBar
                ._hccMenuButton
                .setAttribute(
                  "aria-expanded",
                  "false"
                );
            }
          }

          return;
        }

        const bar =
          this
            .ensureBulkBar();

        if (!bar) {
          return;
        }

        const count =
          this.selectedCards
            .size;

        bar._hccCount
          .textContent =
            `${count} selected`;

        bar.style.display =
          "flex";
      }

      setOverlay(
        element
      ) {
        this.overlay =
          element;

        if (this.overlay) {
          this.overlay
            .style
            .visibility =
              this
                .liveRedrawActive
                ? "hidden"
                : "visible";
        }
      }

      setCardLayer(
        element
      ) {
        this.cardLayer =
          element;

        this
          .scheduleGeometryUpdate();
      }

      setScrollbarTrack(
        element
      ) {
        this.scrollbarTrack =
          element;

        this
          .scheduleGeometryUpdate();
      }

      setScrollbarThumb(
        element
      ) {
        this.scrollbarThumb =
          element;

        this
          .scheduleGeometryUpdate();
      }

      onDecorated(
        term
      ) {
        this.hyperTerm =
          term;

        if (
          this.props
            .onDecorated
        ) {
          this.props
            .onDecorated(
              term
            );
        }

        this
          .findTerminal();
      }

      setLiveRedraw(
        active
      ) {
        const next =
          Boolean(active);

        if (
          this.liveRedrawActive ===
          next
        ) {
          return;
        }

        this.liveRedrawActive =
          next;

        if (this.overlay) {
          this.overlay
            .style
            .visibility =
              next
                ? "hidden"
                : "visible";
        }

        if (!next) {
          this
            .scheduleGeometryUpdate();
        }
      }

      findTerminal(
        attempt = 0
      ) {
        if (
          this.xterm ||
          !this.hyperTerm
        ) {
          return;
        }

        const xterm =
          findXterm(
            this.hyperTerm
          );

        if (!xterm) {
          if (
            attempt < 50
          ) {
            this.retryTimer =
              setTimeout(
                () => {
                  this
                    .findTerminal(
                      attempt +
                        1
                    );
                },
                100
              );
          }

          return;
        }

        this.xterm =
          xterm;

        try {
          this.xterm.options.customGlyphs =
            false;

          this.xterm.options.allowProposedApi =
            true;
        } catch {}

        this.oscHandler =
          registerOscHandler(
            this.xterm,
            this.handleOsc
          );

        if (
          this.xterm &&
          this.xterm.parser &&
          typeof this.xterm
            .parser
            .registerCsiHandler ===
            "function"
        ) {
          this.clearScreenHandler =
            this.xterm
              .parser
              .registerCsiHandler(
                {
                  final: "J",
                },
                (params) => {
                  let values =
                    params;

                  if (
                    !Array.isArray(
                      values
                    ) &&
                    values &&
                    typeof values
                      .toArray ===
                      "function"
                  ) {
                    values =
                      values
                        .toArray();
                  }

                  if (
                    !Array.isArray(
                      values
                    )
                  ) {
                    values =
                      [];
                  }

                  const flat =
                    values
                      .reduce(
                        (
                          result,
                          value
                        ) => {
                          if (
                            Array.isArray(
                              value
                            )
                          ) {
                            return result
                              .concat(
                                value
                              );
                          }

                          result.push(
                            value
                          );

                          return result;
                        },
                        []
                      );

                  if (
                    flat.includes(2) ||
                    flat.includes(3)
                  ) {
                    this
                      .resetCardsAfterClear();
                  }

                  return false;
                }
              );
        }

        if (
          this.xterm &&
          this.xterm.parser &&
          typeof this.xterm
            .parser
            .registerCsiHandler ===
            "function"
        ) {
          for (
            const final
            of [
              "A",
              "F",
              "H",
              "f",
              "K",
            ]
          ) {
            try {
              const disposable =
                this.xterm
                  .parser
                  .registerCsiHandler(
                    {
                      final,
                    },
                    () => {
                      if (
                        this.outputMarker &&
                        !this.outputMarker
                          .isDisposed
                      ) {
                        this
                          .setLiveRedraw(
                            true
                          );
                      }

                      return false;
                    }
                  );

              if (disposable) {
                this.redrawHandlers
                  .push(
                    disposable
                  );
              }
            } catch {}
          }
        }

        this.resizeHandler =
          this.xterm
            .onResize(
              () => {
                setTimeout(
                  () => {
                    this
                      .scheduleGeometryUpdate();
                  },
                  35
                );
              }
            );

        this.scrollHandler =
          this.xterm
            .onScroll(
              (
                viewportY
              ) => {
                this
                  .updateLayerTransform(
                    viewportY
                  );

                this
                  .updateCommandGroups(
                    viewportY
                  );

                this
                  .updateScrollbar(
                    viewportY
                  );

                this
                  .updateStickyCopyControl(
                    viewportY
                  );
              }
            );

        if (
          typeof this.xterm
            .onRender ===
          "function"
        ) {
          this.renderHandler =
            this.xterm
              .onRender(
                () => {
                  this
                    .scheduleGeometryUpdate();
                }
              );
        }

        this
          .scheduleGeometryUpdate();
      }


      registerCommandGroup(
        card
      ) {
        if (
          !card ||
          !card.groupId ||
          !card.groupTotal ||
          card.groupTotal < 2
        ) {
          return;
        }

        let group =
          this.commandGroups
            .get(
              card.groupId
            );

        if (!group) {
          group = {
            id:
              card.groupId,

            total:
              card.groupTotal,

            cards:
              [],

            header:
              null,

            rail:
              null,

            label:
              null,

            copyCard: {
              copyCommand:
                "",

              copyOutput:
                "",

              copyCombined:
                "",
            },
          };

          this.commandGroups
            .set(
              card.groupId,
              group
            );

          this
            .createCommandGroupUi(
              group
            );
        }

        if (
          !group.cards
            .includes(card)
        ) {
          group.cards.push(
            card
          );
        }

        this
          .updateCommandGroupCopy(
            group
          );

        this
          .scheduleGeometryUpdate();
      }

      createCommandGroupUi(
        group
      ) {
        if (
          !this.cardLayer ||
          group.header
        ) {
          return;
        }

        const rail =
          document
            .createElement(
              "div"
            );

        rail.className =
          "hcc-command-group-rail";

        Object.assign(
          rail.style,
          {
            position:
              "absolute",

            width:
              "2px",

            background:
              "rgba(149, 184, 174, 0.48)",

            borderRadius:
              "999px",

            pointerEvents:
              "none",

            zIndex:
              "9",
          }
        );

        const header =
          document
            .createElement(
              "div"
            );

        header.className =
          "hcc-command-group-header";

        Object.assign(
          header.style,
          {
            position:
              "absolute",

            display:
              "flex",

            alignItems:
              "center",

            gap:
              "5px",

            padding:
              "2px 4px",

            background:
              "rgba(149, 184, 174, 0.14)",

            border:
              "1px solid rgba(149, 184, 174, 0.72)",

            borderLeft:
              "3px solid #95B8AE",

            borderRadius:
              "5px",

            boxShadow:
              "0 2px 10px rgba(0, 0, 0, 0.28)",

            pointerEvents:
              "auto",

            zIndex:
              "35",
          }
        );

        const label =
          document
            .createElement(
              "span"
            );

        Object.assign(
          label.style,
          {
            color:
              "#D6E6E1",

            fontWeight:
              "600",

            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",

            fontSize:
              "10.5px",

            lineHeight:
              "20px",

            whiteSpace:
              "nowrap",
          }
        );

        const copyControl =
          createCopyControl(
            group.copyCard
          );

        const copyDisplay =
          copyControl.style.display ||
          "flex";

        group.collapseCard = {
          collapsed:
            false,

          setCollapsed:
            (collapsed) => {
              this
                .setCommandGroupCollapsed(
                  group,
                  collapsed
                );
            },
        };

        const collapseControl =
          createCollapseControl(
            group.collapseCard
          );

        collapseControl
          .button
          .title =
            "Collapse batch";

        collapseControl
          .button
          .setAttribute(
            "aria-label",
            "Collapse batch"
          );

        const collapseDisplay =
          collapseControl.style.display ||
          "flex";

        copyControl.style.display =
          "none";

        collapseControl.style.display =
          "none";

        const showGroupCopy =
          () => {
            copyControl.style.display =
              copyDisplay;

            collapseControl.style.display =
              collapseDisplay;
          };

        const hideGroupCopy =
          () => {
            requestAnimationFrame(
              () => {
                if (
                  !header.matches(
                    ":hover"
                  ) &&
                  !header.contains(
                    document.activeElement
                  )
                ) {
                  copyControl.style.display =
                    "none";

                  collapseControl.style.display =
                    "none";
                }
              }
            );
          };

        header.tabIndex =
          0;

        header.addEventListener(
          "mouseenter",
          showGroupCopy
        );

        header.addEventListener(
          "mouseleave",
          hideGroupCopy
        );

        header.addEventListener(
          "focusin",
          showGroupCopy
        );

        header.addEventListener(
          "focusout",
          hideGroupCopy
        );

        const groupCopyMenu =
          copyControl
            .querySelector(
              ".hcc-copy-menu"
            );

        if (groupCopyMenu) {
          groupCopyMenu
            .style
            .left =
              "0";

          groupCopyMenu
            .style
            .right =
              "auto";
        }

        header.appendChild(
          label
        );

        header.appendChild(
          copyControl
        );

        header.appendChild(
          collapseControl
        );

        this.cardLayer
          .appendChild(
            rail
          );

        this.cardLayer
          .appendChild(
            header
          );

        group.rail =
          rail;

        group.header =
          header;

        group.label =
          label;

        group.collapseControl =
          collapseControl;
      }

      setCommandGroupCollapsed(
        group,
        collapsed
      ) {
        if (!group) {
          return;
        }

        const nextCollapsed =
          Boolean(
            collapsed
          );

        const cards =
          group.cards
            .filter(
              (card) =>
                card &&
                card.start &&
                !card.start
                  .isDisposed &&
                typeof card
                  .setCollapsed ===
                  "function"
            )
            .sort(
              (a, b) =>
                a.start.line -
                b.start.line
            );

        const orderedCards =
          nextCollapsed
            ? [
                ...cards,
              ].reverse()
            : cards;

        for (
          const card
          of orderedCards
        ) {
          if (
            Boolean(
              card.collapsed
            ) !==
            nextCollapsed
          ) {
            card
              .setCollapsed(
                nextCollapsed
              );
          }
        }

        this
          .updateCommandGroupCollapse(
            group
          );

        this
          .scheduleGeometryUpdate();
      }

      updateCommandGroupCollapse(
        group
      ) {
        if (!group) {
          return;
        }

        const cards =
          group.cards
            .filter(
              (card) =>
                card &&
                card.element &&
                card.element
                  .isConnected
            );

        const allCollapsed =
          cards.length > 0 &&
          cards.every(
            (card) =>
              Boolean(
                card.collapsed
              )
          );

        group.collapsed =
          allCollapsed;

        if (
          group.collapseCard
        ) {
          group.collapseCard
            .collapsed =
              allCollapsed;
        }

        const button =
          group.collapseControl &&
          group.collapseControl
            .button;

        if (!button) {
          return;
        }

        button.textContent =
          allCollapsed
            ? "+"
            : "−";

        button.title =
          allCollapsed
            ? "Expand batch"
            : "Collapse batch";

        button
          .setAttribute(
            "aria-label",
            button.title
          );

        button
          .setAttribute(
            "aria-expanded",
            allCollapsed
              ? "false"
              : "true"
          );
      }

      updateCommandGroupCopy(
        group
      ) {
        const clean =
          (value) =>
            String(
              value || ""
            )
              .replace(
                /^(?:[ \t]*\n)+/,
                ""
              )
              .replace(
                /(?:\n[ \t]*)+$/,
                ""
              );

        const cards =
          group.cards
            .filter(
              (card) =>
                card &&
                card.element &&
                card.element
                  .isConnected
            )
            .sort(
              (a, b) =>
                (
                  a.groupIndex || 0
                ) -
                (
                  b.groupIndex || 0
                )
            );

        group.copyCard
          .copyCommand =
            cards
              .map(
                (card) =>
                  clean(
                    card.copyCommand
                  )
              )
              .filter(Boolean)
              .join(
                "\n"
              );

        group.copyCard
          .copyOutput =
            cards
              .map(
                (card) =>
                  clean(
                    card.copyOutput
                  )
              )
              .filter(Boolean)
              .join(
                "\n\n"
              );

        group.copyCard
          .copyCombined =
            cards
              .map(
                (card) => {
                  const command =
                    clean(
                      card.copyCommand
                    );

                  const output =
                    clean(
                      card.copyOutput
                    );

                  return [
                    command,
                    output,
                  ]
                    .filter(Boolean)
                    .join(
                      "\n"
                    );
                }
              )
              .filter(Boolean)
              .join(
                "\n\n"
              );
      }

      updateCommandGroups(
        viewportY = null
      ) {
        if (
          viewportY === null ||
          viewportY === undefined
        ) {
          try {
            viewportY =
              this.xterm
                .buffer
                .active
                .viewportY;
          } catch {
            viewportY =
              this.viewportY;
          }
        }

        const scrollOffset =
          (
            viewportY || 0
          ) *
          (
            this.cellHeight || 0
          );

        const viewportTop =
          this.screenTop || 0;

        const viewportBottom =
          this.wrapper
            ? this.wrapper.clientHeight
            : 0;

        for (
          const [
            id,
            group,
          ]
          of [
            ...this.commandGroups
              .entries(),
          ]
        ) {
          const cards =
            group.cards
              .filter(
                (card) =>
                  card &&
                  card.element &&
                  card.element
                    .isConnected &&
                  card.start &&
                  !card.start
                    .isDisposed &&
                  card.end &&
                  !card.end
                    .isDisposed
              )
              .sort(
                (a, b) =>
                  (
                    a.groupIndex || 0
                  ) -
                  (
                    b.groupIndex || 0
                  )
              );

          group.cards =
            cards;

          if (!cards.length) {
            try {
              group.header
                ?.remove();
            } catch {}

            try {
              group.rail
                ?.remove();
            } catch {}

            this.commandGroups
              .delete(id);

            continue;
          }

          this
            .updateCommandGroupCopy(
              group
            );

          this
            .updateCommandGroupCollapse(
              group
            );

          if (
            group.label
          ) {
            const batchText =
              cards.length ===
                group.total
                ? `${group.total}`
                : `${cards.length}/${group.total}`;

            group.label
              .textContent =
                batchText;

            if (
              group.header
            ) {
              const description =
                cards.length ===
                  group.total
                  ? `${group.total}-command batch`
                  : `${cards.length} of ${group.total} commands in batch`;

              group.header.title =
                description;

              group.header
                .setAttribute(
                  "aria-label",
                  `${description}. Focus or hover for batch controls.`
                );
            }
          }

          const first =
            cards[0];

          const last =
            cards[
              cards.length - 1
            ];

          const firstTop =
            Number.parseFloat(
              first.element
                .style
                .top
            ) || 0;

          const lastTop =
            Number.parseFloat(
              last.element
                .style
                .top
            ) || 0;

          const lastHeight =
            Number.parseFloat(
              last.element
                .style
                .height
            ) || 0;

          const lastBottom =
            lastTop +
            lastHeight;

          const naturalHeaderTop =
            Math.max(
              0,
              firstTop - 38
            );

          const headerHeight =
            (
              group.header &&
              group.header.offsetHeight
            ) || 24;

          const visibleGroupTop =
            naturalHeaderTop -
            scrollOffset;

          const visibleGroupBottom =
            lastBottom -
            scrollOffset;

          const groupIsVisible =
            visibleGroupBottom >
              viewportTop &&
            (
              !viewportBottom ||
              visibleGroupTop <
                viewportBottom
            );

          if (
            group.header
          ) {
            const stickyHeaderTop =
              scrollOffset +
              viewportTop +
              6;

            const latestHeaderTop =
              Math.max(
                naturalHeaderTop,
                lastBottom -
                  headerHeight -
                  6
              );

            const headerTop =
              Math.min(
                Math.max(
                  naturalHeaderTop,
                  stickyHeaderTop
                ),
                latestHeaderTop
              );

            Object.assign(
              group.header.style,
              {
                display:
                  groupIsVisible
                    ? "flex"
                    : "none",

                top:
                  `${headerTop}px`,

                left:
                  `${Math.max(
                    6,
                    CARD_SIDE_GAP
                  )}px`,
              }
            );
          }

          if (
            group.rail
          ) {
            Object.assign(
              group.rail.style,
              {
                top:
                  `${firstTop}px`,

                left:
                  `${Math.max(
                    2,
                    CARD_SIDE_GAP - 5
                  )}px`,

                height:
                  `${Math.max(
                    8,
                    lastBottom -
                      firstTop
                  )}px`,
              }
            );
          }
        }
      }

      resetCardsAfterClear() {
        this
          .closeCardSearch(
            false
          );

        this
          .clearCardSelection();

        this.pendingGroup =
          null;

        this.commandStartedAt =
          null;

        if (
          this.finishTimer
        ) {
          clearTimeout(
            this.finishTimer
          );

          this.finishTimer =
            null;
        }

        this.commandGroups
          .clear();

        if (
          this.stickyCopyCard &&
          this.stickyCopyCard
            .controls
        ) {
          try {
            this.stickyCopyCard
              .controls
              .remove();
          } catch {}

          this.stickyCopyCard =
            null;
        }

        for (
          const card
          of this.cards
        ) {
          try {
            card.element
              .remove();
          } catch {}

          for (
            const element
            of [
              card.collapseMask,
              card.collapsedShell,
            ]
          ) {
            try {
              if (
                element &&
                typeof element.remove ===
                  "function"
              ) {
                element.remove();
              }
            } catch {}
          }

          for (
            const marker
            of [
              card.start,
              card.output,
              card.end,
            ]
          ) {
            try {
              if (
                marker &&
                !marker.isDisposed &&
                typeof marker.dispose ===
                  "function"
              ) {
                marker.dispose();
              }
            } catch {}
          }
        }

        this.cards =
          [];

        try {
          if (
            this.cardLayer
          ) {
            while (
              this.cardLayer
                .firstChild
            ) {
              this.cardLayer
                .removeChild(
                  this.cardLayer
                    .firstChild
                );
            }
          }
        } catch {}

        for (
          const marker
          of [
            this.startMarker,
            this.outputMarker,
          ]
        ) {
          try {
            if (
              marker &&
              !marker.isDisposed &&
              typeof marker.dispose ===
                "function"
            ) {
              marker.dispose();
            }
          } catch {}
        }

        this.startMarker =
          null;

        this.outputMarker =
          null;

        this.scheduleGeometryUpdate();
      }

      handleOsc(
        data
      ) {
        const message =
          String(data);

        if (
          message.startsWith(
            "hcc;group;"
          )
        ) {
          const parts =
            message.split(
              ";"
            );

          const id =
            parts[2] || "";

          const groupIndex =
            Number.parseInt(
              parts[3],
              10
            );

          const total =
            Number.parseInt(
              parts[4],
              10
            );

          this.pendingGroup =
            (
              id &&
              Number.isFinite(
                groupIndex
              ) &&
              Number.isFinite(
                total
              ) &&
              groupIndex > 0 &&
              total > 1
            )
              ? {
                  id,
                  index:
                    groupIndex,
                  total,
                }
              : null;

          return true;
        }

        if (
          message ===
          "hcc;prompt"
        ) {
          this
            .setLiveRedraw(
              false
            );

          this.startCard();

          return true;
        }

        if (
          message ===
          "hcc;output"
        ) {
          this.markOutput();

          return true;
        }

        if (
          message.startsWith(
            "hcc;result;"
          )
        ) {
          const status =
            Number.parseInt(
              message.split(
                ";"
              )[2],
              10
            );

          if (
            this.finishTimer
          ) {
            clearTimeout(
              this.finishTimer
            );

            this.finishTimer =
              null;
          }

          this
            .setLiveRedraw(
              false
            );

          this.finishCard(
            Number.isFinite(status)
              ? status
              : null
          );

          return true;
        }

        if (
          message ===
          "hcc;done"
        ) {
          this
            .setLiveRedraw(
              false
            );

          if (
            this.finishTimer
          ) {
            clearTimeout(
              this.finishTimer
            );
          }

          this.finishTimer =
            setTimeout(
              () => {
                this.finishTimer =
                  null;

                this.finishCard(
                  null
                );
              },
              40
            );

          return true;
        }

        return false;
      }

      startCard() {
        this.pendingGroup =
          null;
        if (
          !this.xterm
        ) {
          return;
        }

        try {
          if (
            this.startMarker &&
            !this.startMarker
              .isDisposed
          ) {
            this.startMarker
              .dispose();
          }
        } catch {}

        try {
          if (
            this.outputMarker &&
            !this.outputMarker
              .isDisposed
          ) {
            this.outputMarker
              .dispose();
          }
        } catch {}

        this.startMarker =
          this.xterm
            .registerMarker(
              0
            );

        this.outputMarker =
          null;
      }

      markOutput() {
        this.commandStartedAt =
          typeof performance !==
            "undefined"
            ? performance.now()
            : Date.now();

        if (
          !this.xterm
        ) {
          return;
        }

        try {
          if (
            this.outputMarker &&
            !this.outputMarker
              .isDisposed
          ) {
            this.outputMarker
              .dispose();
          }
        } catch {}

        this.outputMarker =
          this.xterm
            .registerMarker(
              0
            );
      }

      finishCard(
        exitCode = null
      ) {
        const finishedAt =
          typeof performance !==
            "undefined"
            ? performance.now()
            : Date.now();

        const durationMs =
          this.commandStartedAt ===
            null
            ? null
            : Math.max(
                0,
                finishedAt -
                  this.commandStartedAt
              );

        this.commandStartedAt =
          null;

        if (
          this.xterm &&
          this.startMarker &&
          this.startMarker.isDisposed
        ) {
          try {
            const buffer =
              this.xterm.buffer.active;

            const cursorLine =
              (buffer.baseY || 0) +
              (buffer.cursorY || 0);

            const fallbackStart =
              this.xterm.registerMarker(
                -cursorLine
              );

            if (fallbackStart) {
              this.startMarker =
                fallbackStart;
            }
          } catch {}
        }

        if (
          !this.xterm ||
          !this.startMarker ||
          this.startMarker
            .isDisposed
        ) {
          this.startMarker =
            null;

          this.outputMarker =
            null;

          return;
        }

        const endMarker =
          this.xterm
            .registerMarker(
              0
            );

        if (
          !endMarker ||
          !this.cardLayer
        ) {
          try {
            if (
              endMarker
            ) {
              endMarker
                .dispose();
            }
          } catch {}

          return;
        }

        const copyCommand =
          extractCommand(
            this.xterm,
            this.startMarker,
            this.outputMarker
          );

        const copyOutput =
          extractOutput(
            this.xterm,
            this.outputMarker,
            endMarker
          );

        const element =
          document
            .createElement(
              "div"
            );

        element.className =
          "hyper-command-card";

        Object.assign(
          element.style,
          {
            position:
              "absolute",

            left:
              `${CARD_SIDE_GAP}px`,

            right:
              `${CARD_SIDE_GAP}px`,

            pointerEvents:
              "none",

            background:
              "rgba(255, 255, 255, 0.012)",

            border:
              "1px solid #3D4850",

            borderRadius:
              `${BORDER_RADIUS}px`,

            boxShadow:
              "0 5px 16px rgba(0, 0, 0, 0.30), 0 1px 2px rgba(0, 0, 0, 0.22)",

            boxSizing:
              "border-box",

            zIndex:
              "10",
          }
        );

        const card = {
          start:
            this.startMarker,

          output:
            this.outputMarker,

          end:
            endMarker,

          element,

          copyCommand,

          copyOutput,

          exitCode,

          durationMs,

          groupId:
            this.pendingGroup
              ? this.pendingGroup.id
              : null,

          groupIndex:
            this.pendingGroup
              ? this.pendingGroup.index
              : null,

          groupTotal:
            this.pendingGroup
              ? this.pendingGroup.total
              : null,

          collapsed:
            false,

          commandRows:
            this.outputMarker &&
            !this.outputMarker
              .isDisposed
              ? Math.max(
                  1,
                  this.outputMarker.line -
                    this.startMarker.line
                )
              : 2,

          savedLines:
            null,
        };

        const collapseMask =
          document
            .createElement(
              "div"
            );

        Object.assign(
          collapseMask.style,
          {
            position:
              "absolute",

            left:
              "0",

            right:
              "0",

            bottom:
              "0",

            display:
              "none",

            background:
              "#212121",

            pointerEvents:
              "none",

            zIndex:
              "12",
          }
        );

        const collapsedShell =
          document
            .createElement(
              "div"
            );

        Object.assign(
          collapsedShell.style,
          {
            position:
              "absolute",

            left:
              "0",

            right:
              "0",

            top:
              "0",

            display:
              "none",

            background:
              "rgba(255, 255, 255, 0.012)",

            border:
              "1px solid #3D4850",

            borderRadius:
              `${BORDER_RADIUS}px`,

            boxShadow:
              "0 5px 16px rgba(0, 0, 0, 0.30), 0 1px 2px rgba(0, 0, 0, 0.22)",

            boxSizing:
              "border-box",

            pointerEvents:
              "none",

            zIndex:
              "13",
          }
        );

        card.collapseMask =
          collapseMask;

        card.collapsedShell =
          collapsedShell;

        element.appendChild(
          collapseMask
        );

        element.appendChild(
          collapsedShell
        );

        const controls =
          document
            .createElement(
              "div"
            );

        Object.assign(
          controls.style,
          {
            position:
              "absolute",

            top:
              "6px",

            right:
              "10px",

            display:
              "flex",

            alignItems:
              "stretch",

            gap:
              "8px",

            pointerEvents:
              "auto",

            zIndex:
              "30",
          }
        );

        const statusLabel =
          document
            .createElement(
              "span"
            );

        const hasExitCode =
          Number.isInteger(
            card.exitCode
          );

        const success =
          hasExitCode &&
          card.exitCode === 0;

        const durationText =
          card.durationMs !==
            null &&
          card.durationMs >= 1000
            ? (
                card.durationMs <
                  10000
                  ? `${(
                      card.durationMs /
                      1000
                    ).toFixed(1)}s`
                  : card.durationMs <
                      60000
                    ? `${Math.round(
                        card.durationMs /
                          1000
                      )}s`
                    : `${Math.floor(
                        card.durationMs /
                          60000
                      )}m ${Math.round(
                        (
                          card.durationMs %
                          60000
                        ) /
                          1000
                      )}s`
              )
            : "";

        if (hasExitCode) {
          const statusText =
            success
              ? "✓ Success"
              : `! Failed · code ${card.exitCode}`;

          statusLabel.textContent =
            durationText
              ? `${statusText} · ${durationText}`
              : statusText;

          statusLabel.title =
            success
              ? (
                  durationText
                    ? `Command completed successfully in ${durationText}`
                    : "Command completed successfully"
                )
              : (
                  durationText
                    ? `Command failed with exit code ${card.exitCode} after ${durationText}`
                    : `Command failed with exit code ${card.exitCode}`
                );

          statusLabel
            .setAttribute(
              "aria-label",
              statusLabel.title
            );
        } else if (
          durationText
        ) {
          statusLabel.textContent =
            durationText;

          statusLabel.title =
            `Command completed in ${durationText}`;

          statusLabel
            .setAttribute(
              "aria-label",
              statusLabel.title
            );
        }

        Object.assign(
          statusLabel.style,
          {
            display:
              statusLabel.textContent
                ? "inline-flex"
                : "none",

            alignItems:
              "center",

            alignSelf:
              "center",

            minHeight:
              "20px",

            padding:
              "1px 2px",

            color:
              hasExitCode
                ? (
                    success
                      ? "#A9C9A3"
                      : "#D8A2A2"
                  )
                : "#AAB2BA",

            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",

            fontSize:
              "10.5px",

            lineHeight:
              "16px",

            fontWeight:
              "500",

            whiteSpace:
              "nowrap",

            pointerEvents:
              "none",
          }
        );

        card.statusLabel =
          statusLabel;

        const copyControl =
          createCopyControl(card);

        const collapseControl =
          createCollapseControl(card);

        card.copyControl =
          copyControl;

        card.collapseControl =
          collapseControl;

        card.controls =
          controls;

        const selectButton =
          document
            .createElement(
              "button"
            );

        selectButton.type =
          "button";

        selectButton
          .textContent =
            "○";

        selectButton.title =
          "Select card";

        selectButton
          .setAttribute(
            "aria-label",
            "Select card"
          );

        selectButton
          .setAttribute(
            "aria-pressed",
            "false"
          );

        applyButtonBase(
          selectButton
        );

        Object.assign(
          selectButton.style,
          {
            position:
              "relative",

            top:
              "0",

            right:
              "0",

            width:
              "22px",

            minWidth:
              "22px",

            padding:
              "1px 0",

            background:
              "rgba(33, 33, 33, 0.88)",

            border:
              "1px solid #3D4850",

            borderRadius:
              "8px",

            boxShadow:
              "0 2px 8px rgba(0, 0, 0, 0.24)",

            opacity:
              "1",
          }
        );

        selectButton
          .addEventListener(
            "click",
            (event) => {
              event
                .preventDefault();

              event
                .stopPropagation();

              this
                .toggleCardSelection(
                  card
                );
            }
          );

        controls
          .addEventListener(
            "mouseenter",
            () => {
              selectButton
                .style
                .opacity =
                  "1";
            }
          );

        controls
          .addEventListener(
            "mouseleave",
            () => {
              if (
                !this.selectedCards
                  .size &&
                !this.selectedCards
                  .has(card)
              ) {
                selectButton
                  .style
                  .opacity =
                    "1";
              }
            }
          );

        card.selectButton =
          selectButton;

        Object.assign(
          copyControl.style,
          {
            position:
              "relative",

            top:
              "0",

            right:
              "0",

            margin:
              "0",

            alignSelf:
              "center",
          }
        );

        Object.assign(
          collapseControl.style,
          {
            position:
              "relative",

            top:
              "0",

            right:
              "0",

            margin:
              "0",

            alignSelf:
              "center",
          }
        );

        controls.style.alignItems =
          "center";

        card.setCollapsed =
          (collapsed) => {
            const nextCollapsed =
              Boolean(collapsed);

            if (
              nextCollapsed ===
              card.collapsed
            ) {
              return;
            }

            const changed =
              nextCollapsed
                ? this
                    .collapseCardRows(
                      card
                    )
                : this
                    .expandCardRows(
                      card
                    );

            if (!changed) {
              console.warn(
                "[hyper-command-cards] Could not change collapse state."
              );

              return;
            }

            card.collapsed =
              nextCollapsed;

            collapseControl
              .button
              .textContent =
                card.collapsed
                  ? "+"
                  : "−";

            collapseControl
              .button
              .title =
                card.collapsed
                  ? "Expand card"
                  : "Collapse card";

            collapseControl
              .button
              .setAttribute(
                "aria-label",
                card.collapsed
                  ? "Expand card"
                  : "Collapse card"
              );

            collapseControl
              .button
              .setAttribute(
                "aria-expanded",
                card.collapsed
                  ? "false"
                  : "true"
              );

            this
              .scheduleGeometryUpdate();
          };

        controls.appendChild(
          selectButton
        );

        controls.appendChild(
          statusLabel
        );

        controls.appendChild(
          copyControl
        );

        controls.appendChild(
          collapseControl
        );

        element.appendChild(
          controls
        );

        this.cardLayer
          .appendChild(
            element
          );

        this.cards.push(
          card
        );

        if (
          this.searchBar &&
          this.searchBar.style
            .display !==
            "none"
        ) {
          this
            .updateCardSearch(
              this.searchInput
                ? this.searchInput
                    .value
                : this.searchQuery
            );
        }

        this
          .registerCommandGroup(
            card
          );

        this.pendingGroup =
          null;

        this
          .updateSelectionUi();

        this.startMarker =
          null;

        this.outputMarker =
          null;

        this
          .scheduleGeometryUpdate();
      }

      // True collapse changes xterm's scrollback, so it needs direct
      // access to the internal line buffer. Return null if that API changes.
      getMutableBuffer() {
        try {
          const core =
            this.xterm &&
            this.xterm._core;

          const bufferService =
            core &&
            core._bufferService;

          const buffer =
            bufferService &&
            bufferService.buffer;

          const lines =
            buffer &&
            buffer.lines;

          if (
            !buffer ||
            !lines ||
            typeof lines.get !==
              "function" ||
            typeof lines.push !==
              "function" ||
            typeof lines.splice !==
              "function" ||
            typeof buffer
              .getBlankLine !==
              "function"
          ) {
            return null;
          }

          return {
            core,
            buffer,
            lines,
          };
        } catch {
          return null;
        }
      }

      refreshAfterBufferMutation() {
        const mutable =
          this.getMutableBuffer();

        try {
          if (
            typeof this.xterm
              .clearSelection ===
            "function"
          ) {
            this.xterm
              .clearSelection();
          }
        } catch {}

        try {
          const viewport =
            mutable &&
            mutable.core &&
            (
              mutable.core._viewport ||
              mutable.core.viewport
            );

          if (
            viewport &&
            typeof viewport
              .syncScrollArea ===
              "function"
          ) {
            viewport
              .syncScrollArea();
          }
        } catch {}

        try {
          const viewportElement =
            this.xterm &&
            this.xterm.element &&
            this.xterm.element
              .querySelector(
                ".xterm-viewport"
              );

          const scrollArea =
            this.xterm &&
            this.xterm.element &&
            this.xterm.element
              .querySelector(
                ".xterm-scroll-area"
              );

          if (
            mutable &&
            this.cellHeight
          ) {
            if (scrollArea) {
              scrollArea.style.height =
                `${
                  mutable.lines.length *
                  this.cellHeight
                }px`;
            }

            if (viewportElement) {
              viewportElement.scrollTop =
                mutable.buffer.ydisp *
                this.cellHeight;
            }
          }
        } catch {}

        try {
          this.xterm
            .refresh(
              0,
              Math.max(
                0,
                this.xterm.rows - 1
              )
            );
        } catch {}

        this
          .scheduleGeometryUpdate();
      }

      collapseCardRows(
        card
      ) {
        const mutable =
          this.getMutableBuffer();

        if (
          !mutable ||
          !card ||
          !card.start ||
          card.start.isDisposed ||
          !card.end ||
          card.end.isDisposed
        ) {
          return false;
        }

        const {
          buffer,
          lines,
        } = mutable;

        const commandRows =
          Math.max(
            1,
            card.commandRows || 1
          );

        const deleteStart =
          card.start.line +
          commandRows;

        const deleteCount =
          Math.max(
            0,
            card.end.line -
              deleteStart
          );

        if (!deleteCount) {
          card.savedLines =
            [];

          return true;
        }

        if (
          deleteStart < 0 ||
          deleteStart +
            deleteCount >
            lines.length
        ) {
          return false;
        }

        const savedLines =
          [];

        for (
          let i = 0;
          i < deleteCount;
          i++
        ) {
          const line =
            lines.get(
              deleteStart + i
            );

          if (
            !line ||
            typeof line.clone !==
              "function"
          ) {
            return false;
          }

          savedLines.push(
            line.clone()
          );
        }

        const rows =
          this.xterm.rows;

        const oldYbase =
          buffer.ybase || 0;

        const oldYdisp =
          buffer.ydisp || 0;

        const oldY =
          buffer.y || 0;

        const oldCursor =
          oldYbase + oldY;

        const wasAtBottom =
          oldYdisp === oldYbase;

        const deletedBefore =
          (point) =>
            Math.max(
              0,
              Math.min(
                deleteCount,
                point -
                  deleteStart
              )
            );

        const deletedBeforeBase =
          deletedBefore(
            oldYbase
          );

        const deletedBeforeDisplay =
          deletedBefore(
            oldYdisp
          );

        const deletedBeforeCursor =
          deletedBefore(
            oldCursor
          );

        lines.splice(
          deleteStart,
          deleteCount
        );

        while (
          lines.length <
          rows
        ) {
          lines.push(
            buffer.getBlankLine(
              undefined,
              false
            )
          );
        }

        const newAbsoluteCursor =
          Math.max(
            0,
            oldCursor -
              deletedBeforeCursor
          );

        const maxBase =
          Math.max(
            0,
            lines.length -
              rows
          );

        let newYbase =
          Math.max(
            0,
            Math.min(
              maxBase,
              oldYbase -
                deletedBeforeBase
            )
          );

        if (
          newAbsoluteCursor -
            newYbase >=
          rows
        ) {
          newYbase =
            Math.min(
              maxBase,
              Math.max(
                newYbase,
                newAbsoluteCursor -
                  rows +
                  1
              )
            );
        }

        buffer.ybase =
          newYbase;

        buffer.y =
          Math.max(
            0,
            Math.min(
              rows - 1,
              newAbsoluteCursor -
                newYbase
            )
          );

        buffer.ydisp =
          wasAtBottom
            ? newYbase
            : Math.max(
                0,
                Math.min(
                  newYbase,
                  oldYdisp -
                    deletedBeforeDisplay
                )
              );

        card.savedLines =
          savedLines;

        card.output =
          null;

        this
          .refreshAfterBufferMutation();

        return true;
      }

      expandCardRows(
        card
      ) {
        const mutable =
          this.getMutableBuffer();

        if (
          !mutable ||
          !card ||
          !card.start ||
          card.start.isDisposed ||
          !card.end ||
          card.end.isDisposed ||
          !Array.isArray(
            card.savedLines
          )
        ) {
          return false;
        }

        const {
          buffer,
          lines,
        } = mutable;

        const savedLines =
          card.savedLines;

        if (!savedLines.length) {
          card.savedLines =
            null;

          return true;
        }

        if (
          lines.length +
            savedLines.length >
          lines.maxLength
        ) {
          console.warn(
            "[hyper-command-cards] Not enough xterm scrollback remains to expand this card."
          );

          return false;
        }

        const insertAt =
          card.start.line +
          Math.max(
            1,
            card.commandRows || 1
          );

        if (
          insertAt < 0 ||
          insertAt >
            lines.length
        ) {
          return false;
        }

        const restored =
          savedLines.map(
            (line) =>
              typeof line.clone ===
                "function"
                ? line.clone()
                : line
          );

        const count =
          restored.length;

        const rows =
          this.xterm.rows;

        const oldYbase =
          buffer.ybase || 0;

        const oldYdisp =
          buffer.ydisp || 0;

        const oldY =
          buffer.y || 0;

        const oldCursor =
          oldYbase + oldY;

        const wasAtBottom =
          oldYdisp === oldYbase;

        const insertBeforeBase =
          insertAt <
            oldYbase
            ? count
            : 0;

        const insertBeforeDisplay =
          insertAt <
            oldYdisp
            ? count
            : 0;

        const insertBeforeCursor =
          insertAt <=
            oldCursor
            ? count
            : 0;

        lines.splice(
          insertAt,
          0,
          ...restored
        );

        const newAbsoluteCursor =
          oldCursor +
          insertBeforeCursor;

        const maxBase =
          Math.max(
            0,
            lines.length -
              rows
          );

        let newYbase =
          Math.max(
            0,
            Math.min(
              maxBase,
              oldYbase +
                insertBeforeBase
            )
          );

        if (
          newAbsoluteCursor -
            newYbase >=
          rows
        ) {
          newYbase =
            Math.min(
              maxBase,
              Math.max(
                newYbase,
                newAbsoluteCursor -
                  rows +
                  1
              )
            );
        }

        buffer.ybase =
          newYbase;

        buffer.y =
          Math.max(
            0,
            Math.min(
              rows - 1,
              newAbsoluteCursor -
                newYbase
            )
          );

        buffer.ydisp =
          wasAtBottom
            ? newYbase
            : Math.max(
                0,
                Math.min(
                  newYbase,
                  oldYdisp +
                    insertBeforeDisplay
                )
              );

        card.savedLines =
          null;

        this
          .refreshAfterBufferMutation();

        return true;
      }

      scheduleGeometryUpdate() {
        if (
          this.geometryFrame
        ) {
          return;
        }

        this.geometryFrame =
          requestAnimationFrame(
            () => {
              this.geometryFrame =
                null;

              this
                .updateGeometry();
            }
          );
      }

      getScreenMetrics() {
        if (
          !this.xterm ||
          !this.wrapper
        ) {
          return null;
        }

        const screen =
          this.xterm
            .screenElement ||
          (
            this.xterm
              .element &&
            this.xterm
              .element
              .querySelector(
                ".xterm-screen"
              )
          );

        if (!screen) {
          return null;
        }

        const wrapperRect =
          this.wrapper
            .getBoundingClientRect();

        const screenRect =
          screen
            .getBoundingClientRect();

        const rows =
          this.xterm.rows;

        if (
          !rows ||
          !screenRect
            .height
        ) {
          return null;
        }

        const cellHeight =
          screenRect
            .height /
          rows;

        const screenTop =
          screenRect.top -
          wrapperRect.top;

        let viewportY =
          0;

        try {
          viewportY =
            this.xterm
              .buffer
              .active
              .viewportY;
        } catch {}

        return {
          cellHeight,
          screenTop,
          viewportY,
        };
      }

      updateLayerTransform(
        viewportY = null
      ) {
        if (
          !this.cardLayer ||
          !this.xterm
        ) {
          return;
        }

        if (
          viewportY === null ||
          viewportY === undefined
        ) {
          try {
            viewportY =
              this.xterm
                .buffer
                .active
                .viewportY;
          } catch {
            viewportY =
              this.viewportY;
          }
        }

        this.viewportY =
          viewportY;

        if (
          !this.cellHeight
        ) {
          return;
        }

        const y =
          -viewportY *
          this.cellHeight;

        this.cardLayer
          .style
          .transform =
            `translate3d(0, ${y}px, 0)`;
      }

      updateStickyCopyControl(
        viewportY = null
      ) {
        if (
          !this.overlay ||
          !this.xterm ||
          !this.cellHeight
        ) {
          return;
        }

        if (
          viewportY === null ||
          viewportY === undefined
        ) {
          try {
            viewportY =
              this.xterm
                .buffer
                .active
                .viewportY;
          } catch {
            viewportY =
              this.viewportY;
          }
        }

        const viewportTop =
          this.screenTop;

        const anchorTop =
          viewportTop + 6;

        const controlHeight =
          22;

        let activeCard =
          null;

        let activeBottom =
          0;

        // Find the card crossing the top edge of the viewport.
        for (
          const card
          of this.cards
        ) {
          if (
            !card.element ||
            !card.controls ||
            card.start.isDisposed ||
            card.end.isDisposed
          ) {
            continue;
          }

          const cardTop =
            Number.parseFloat(
              card.element.style.top
            ) || 0;

          const cardHeight =
            Number.parseFloat(
              card.element.style.height
            ) || 0;

          const visibleTop =
            cardTop -
            viewportY *
              this.cellHeight;

          const visibleBottom =
            visibleTop +
            cardHeight;

          if (
            visibleTop <
              viewportTop &&
            visibleBottom >
              viewportTop
          ) {
            activeCard =
              card;

            activeBottom =
              visibleBottom;

            break;
          }
        }

        // Return the previous controls to their card.
        if (
          this.stickyCopyCard &&
          this.stickyCopyCard !==
            activeCard
        ) {
          const oldCard =
            this.stickyCopyCard;

          if (
            this.cards.includes(
              oldCard
            ) &&
            oldCard.element &&
            oldCard.controls
          ) {
            oldCard.element
              .appendChild(
                oldCard.controls
              );

            Object.assign(
              oldCard.controls
                .style,
              {
                position:
                  "absolute",

                top:
                  "6px",

                right:
                  "10px",

                transform:
                  "none",

                zIndex:
                  "30",
              }
            );
          } else if (
            oldCard.controls
          ) {
            oldCard.controls
              .remove();
          }

          this.stickyCopyCard =
            null;
        }

        if (!activeCard) {
          return;
        }

        // Pin the active card's controls to the viewport.
        if (
          this.stickyCopyCard !==
            activeCard
        ) {
          this.stickyCopyCard =
            activeCard;

          this.overlay
            .appendChild(
              activeCard
                .controls
            );

          Object.assign(
            activeCard
              .controls
              .style,
            {
              position:
                "absolute",

              right:
                `${CARD_SIDE_GAP + 10}px`,

              transform:
                "none",

              zIndex:
                "50",
            }
          );
        }

        // Let the controls leave with the bottom of the card.
        const stickyTop =
          Math.min(
            anchorTop,

            activeBottom -
              controlHeight -
              6
          );

        activeCard
          .controls
          .style
          .top =
            `${stickyTop}px`;
      }

      updateScrollbar(
        viewportY = null
      ) {
        if (
          !this.xterm ||
          !this.scrollbarTrack ||
          !this.scrollbarThumb
        ) {
          return;
        }

        const buffer =
          this.xterm
            .buffer
            .active;

        if (
          viewportY === null ||
          viewportY === undefined
        ) {
          try {
            viewportY =
              buffer.viewportY;
          } catch {
            viewportY =
              this.viewportY;
          }
        }

        const maxViewportY =
          Math.max(
            0,
            buffer.baseY || 0
          );

        if (
          maxViewportY <= 0
        ) {
          this.scrollbarThumb
            .style
            .display =
              "none";

          return;
        }

        const trackHeight =
          this.scrollbarTrack
            .clientHeight;

        if (!trackHeight) {
          return;
        }

        const thumbHeight =
          Math.min(
            SCROLLBAR_THUMB_HEIGHT,
            trackHeight
          );

        const usableHeight =
          Math.max(
            0,
            trackHeight -
            thumbHeight
          );

        const ratio =
          Math.max(
            0,
            Math.min(
              1,
              viewportY /
              maxViewportY
            )
          );

        const thumbTop =
          usableHeight *
          ratio;

        Object.assign(
          this.scrollbarThumb
            .style,
          {
            display:
              "block",

            height:
              `${thumbHeight}px`,

            transform:
              `translate3d(0, ${thumbTop}px, 0)`,
          }
        );
      }

      updateGeometry() {
        if (
          !this.xterm ||
          !this.wrapper ||
          !this.cardLayer
        ) {
          return;
        }

        const metrics =
          this
            .getScreenMetrics();

        if (!metrics) {
          return;
        }

        this.cellHeight =
          metrics
            .cellHeight;

        this.screenTop =
          metrics
            .screenTop;

        this.viewportY =
          metrics
            .viewportY;

        for (
          const card
          of [
            ...this.cards,
          ]
        ) {
          if (
            card.start
              .isDisposed ||
            card.end
              .isDisposed
          ) {
            if (
              this.stickyCopyCard ===
                card
            ) {
              try {
                card.controls
                  .remove();
              } catch {}

              this.stickyCopyCard =
                null;
            }

            try {
              card.element
                .remove();
            } catch {}

            this.selectedCards
              .delete(card);

            this.cards =
              this.cards
                .filter(
                  (item) =>
                    item !==
                    card
                );

            this
              .updateSelectionUi();

            continue;
          }

          const rowCount =
            Math.max(
              1,
              card.end.line -
              card.start.line
            );

          const top =
            this.screenTop +
            card.start.line *
              this.cellHeight +
            VERTICAL_INSET;

          const height =
            Math.max(
              2,
              rowCount *
                this.cellHeight -
              VERTICAL_INSET *
                2
            );

          const commandRows =
            Math.max(
              1,
              card.commandRows || 1
            );

          const collapsedHeight =
            Math.max(
              30,
              commandRows *
                this.cellHeight -
              VERTICAL_INSET *
                2
            );

          Object.assign(
            card.element
              .style,
            {
              top:
                `${top}px`,

              height:
                `${height}px`,

              background:
                card.collapsed
                  ? "transparent"
                  : "rgba(255, 255, 255, 0.012)",

              border:
                card.collapsed
                  ? "1px solid transparent"
                  : (
                      this.selectedCards
                        .has(card)
                        ? "1px solid #95B8AE"
                        : "1px solid #3D4850"
                    ),

              boxShadow:
                card.collapsed
                  ? "none"
                  : "0 5px 16px rgba(0, 0, 0, 0.30), 0 1px 2px rgba(0, 0, 0, 0.22)",
            }
          );

          if (
            card.collapseMask &&
            card.collapsedShell
          ) {
            Object.assign(
              card.collapseMask
                .style,
              {
                display:
                  card.collapsed
                    ? "block"
                    : "none",

                top:
                  `${Math.min(
                    collapsedHeight,
                    height
                  )}px`,
              }
            );

            Object.assign(
              card.collapsedShell
                .style,
              {
                display:
                  card.collapsed
                    ? "block"
                    : "none",

                height:
                  `${Math.min(
                    collapsedHeight,
                    height
                  )}px`,
              }
            );
          }
        }

        this
          .updateCommandGroups();

        this
          .updateLayerTransform(
            this.viewportY
          );

        this
          .updateStickyCopyControl();

        this
          .updateScrollbar(
            this.viewportY
          );
      }

      render() {
        return React
          .createElement(
            "div",
            {
              ref:
                this
                  .setWrapper,

              className:
                "hyper-command-cards-root",

              style: {
                position:
                  "relative",

                width:
                  "100%",

                height:
                  "100%",
              },
            },

            React
              .createElement(
                Term,
                Object.assign(
                  {},
                  this.props,
                  {
                    onDecorated:
                      this
                        .onDecorated,
                  }
                )
              ),

            React
              .createElement(
                "style",
                null,
                `
                  .hyper-command-cards-root .xterm-viewport::-webkit-scrollbar {
                    width: ${SCROLLBAR_NATIVE_GUTTER}px !important;
                    height: ${SCROLLBAR_NATIVE_GUTTER}px !important;
                  }

                  .hyper-command-cards-root .xterm-viewport::-webkit-scrollbar-track {
                    background: transparent !important;
                  }

                  .hyper-command-cards-root .xterm-viewport::-webkit-scrollbar-thumb {
                    background: transparent !important;
                    border-color: transparent !important;
                  }

                  .hyper-command-cards-root .xterm-viewport::-webkit-scrollbar-corner {
                    background: transparent !important;
                  }
                `
              ),

            React
              .createElement(
                "div",
                {
                  ref:
                    this
                      .setOverlay,

                  style: {
                    position:
                      "absolute",

                    inset:
                      "0",

                    overflow:
                      "hidden",

                    pointerEvents:
                      "none",

                    zIndex:
                      "20",
                  },
                },

                React
                  .createElement(
                    "div",
                    {
                      ref:
                        this
                          .setCardLayer,

                      style: {
                        position:
                          "absolute",

                        inset:
                          "0",

                        pointerEvents:
                          "none",

                        willChange:
                          "transform",

                        transform:
                          "translate3d(0, 0, 0)",
                      },
                    }
                  ),

                React
                  .createElement(
                    "div",
                    {
                      ref:
                        this
                          .setScrollbarTrack,

                      "aria-hidden":
                        "true",

                      style: {
                        position:
                          "absolute",

                        top:
                          `${SCROLLBAR_TOP_GAP}px`,

                        bottom:
                          `${SCROLLBAR_BOTTOM_GAP}px`,

                        right:
                          `${SCROLLBAR_RIGHT}px`,

                        width:
                          `${SCROLLBAR_WIDTH}px`,

                        background:
                          SCROLLBAR_TRACK_COLOR,

                        borderRadius:
                          "999px",

                        pointerEvents:
                          "none",

                        zIndex:
                          "60",
                      },
                    },

                    React
                      .createElement(
                        "div",
                        {
                          ref:
                            this
                              .setScrollbarThumb,

                          style: {
                            position:
                              "absolute",

                            top:
                              "0",

                            left:
                              "0",

                            width:
                              "100%",

                            height:
                              `${SCROLLBAR_THUMB_HEIGHT}px`,

                            background:
                              SCROLLBAR_THUMB_COLOR,

                            borderRadius:
                              "999px",

                            boxShadow:
                              "0 0 0 1px rgba(33, 33, 33, 0.28)",

                            willChange:
                              "transform",

                            pointerEvents:
                              "none",
                          },
                        }
                      )
                  )
              )
          );
      }
    };
  };
