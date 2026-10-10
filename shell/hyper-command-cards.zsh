# Hyper Command Cards shell integration.

if [[ -n ${HCC_LOADED:-} ]]; then
  return 0
fi

typeset -g HCC_SESSION_TOKEN
HCC_SESSION_TOKEN="$(
  LC_ALL=C /usr/bin/od -An -N16 -tx1 /dev/urandom 2>/dev/null |
    /usr/bin/tr -d ' \n'
)"

if (( ${#HCC_SESSION_TOKEN} != 32 )) ||
   [[ -n ${HCC_SESSION_TOKEN//[0-9a-f]/} ]]; then
  unset HCC_SESSION_TOKEN
  print -u2 -- "Hyper Cards: could not create a session token."
  return 1
fi

readonly HCC_SESSION_TOKEN
typeset -g HCC_LOADED=1

printf '\e]777;hcc;session;%s\a' \
  "$HCC_SESSION_TOKEN"
typeset -g HCC_CARD_OPEN=0
typeset -ga HCC_COMMAND_QUEUE=()
typeset -gi HCC_GROUP_COUNTER=0
typeset -g HCC_ACTIVE_GROUP=""
typeset -gi HCC_GROUP_INDEX=0
typeset -gi HCC_GROUP_TOTAL=0
typeset -g HCC_EXPECTED_GROUP_COMMAND=""

PROMPT_EOL_MARK=''

typeset -gi HCC_OUTPUT_MARKED=0
typeset -gi HCC_CLEAR_PENDING=0
typeset -gi HCC_STARSHIP_PREFIX_ROWS=0

typeset -g HCC_COMMENT_MODE="${HCC_COMMENT_MODE:-show}"

case "$HCC_COMMENT_MODE" in
  show|hide)
    ;;
  *)
    HCC_COMMENT_MODE="show"
    ;;
esac

autoload -Uz add-zsh-hook
autoload -Uz add-zle-hook-widget

# Starship uses a two-line prompt in the Hyper Cards preset. Keeping
# only the editable line in PROMPT avoids duplicate prompt rows when
# the terminal is resized.
typeset -g HCC_STARSHIP_PROMPT_SOURCE=""

if [[ $PROMPT == *"starship prompt"* ]]; then
  HCC_STARSHIP_PROMPT_SOURCE="$PROMPT"
fi

_hcc_split_starship_prompt() {
  emulate -L zsh
  setopt localoptions promptsubst

  [[ -n ${HCC_STARSHIP_PROMPT_SOURCE:-} ]] ||
    return

  local hcc_expanded
  local -a hcc_prompt_lines

  # Expand Starship's command substitution without performing
  # zsh prompt expansion. This preserves the nonprinting markers
  # Starship provides for ZLE cursor-width accounting.
  hcc_expanded="${(e)HCC_STARSHIP_PROMPT_SOURCE}"

  hcc_prompt_lines=(
    "${(@f)hcc_expanded}"
  )

  HCC_STARSHIP_PREFIX_ROWS=$(( ${#hcc_prompt_lines[@]} - 1 ))

  (( HCC_STARSHIP_PREFIX_ROWS < 0 )) &&
    HCC_STARSHIP_PREFIX_ROWS=0

  (( ${#hcc_prompt_lines[@]} )) ||
    return

  if (( ${#hcc_prompt_lines[@]} > 1 )); then
    print -P -- \
      "${(F)hcc_prompt_lines[1,-2]}"
  fi

  PROMPT="${hcc_prompt_lines[-1]}"
}


_hcc_prompt_columns() {
  emulate -L zsh
  setopt localoptions extendedglob promptsubst

  local hcc_prompt
  hcc_prompt=$(print -P -- "$PROMPT")
  hcc_prompt="${hcc_prompt##*$'\n'}"
  hcc_prompt="${hcc_prompt//$'\r'/}"
  hcc_prompt="${hcc_prompt//$'\e'\[[0-9;]##[[:alpha:]]/}"

  print -r -- ${#hcc_prompt}
}


_hcc_preexec() {
  local hcc_preexec_command="$1"

  case "$hcc_preexec_command" in
    clear|"clear -x")
      HCC_CLEAR_PENDING=1
      HCC_CARD_OPEN=0
      HCC_OUTPUT_MARKED=0

      # DEC save cursor. clear may home the terminal, but the
      # original prompt position can be restored afterward.
      printf '\e7'

      return 0
      ;;
    *)
      HCC_CLEAR_PENDING=0
      ;;
  esac

  printf '\r\n'

  if [[ -n ${HCC_ACTIVE_GROUP:-} ]]; then
    if [[
      -n ${HCC_EXPECTED_GROUP_COMMAND:-} &&
      "$hcc_preexec_command" == "$HCC_EXPECTED_GROUP_COMMAND"
    ]]; then
      printf '\e]777;hcc;%s;group;%s;%d;%d\a' \
        "$HCC_SESSION_TOKEN" \
        "$HCC_ACTIVE_GROUP" \
        "$HCC_GROUP_INDEX" \
        "$HCC_GROUP_TOTAL"

      if (( HCC_GROUP_INDEX >= HCC_GROUP_TOTAL )); then
        HCC_ACTIVE_GROUP=""
        HCC_GROUP_INDEX=0
        HCC_GROUP_TOTAL=0
        HCC_EXPECTED_GROUP_COMMAND=""
      else
        HCC_GROUP_INDEX=$(( HCC_GROUP_INDEX + 1 ))
      fi
    else
      # A different command ran before the expected queued
      # command. Cancel the pending group so its metadata is not
      # attached to an unrelated card.
      HCC_ACTIVE_GROUP=""
      HCC_GROUP_INDEX=0
      HCC_GROUP_TOTAL=0
      HCC_EXPECTED_GROUP_COMMAND=""
      HCC_COMMAND_QUEUE=()
    fi
  fi

  local -i hcc_indent
  hcc_indent=$(_hcc_prompt_columns)

  (( hcc_indent < 0 )) &&
    hcc_indent=0

  (( hcc_indent > 999 )) &&
    hcc_indent=999

  printf '\e]777;hcc;%s;indent;%03d\a' \
    "$HCC_SESSION_TOKEN" \
    "$hcc_indent"

  printf '\e]777;hcc;%s;output\a' \
    "$HCC_SESSION_TOKEN"
  HCC_OUTPUT_MARKED=1
}

_hcc_precmd() {
  local hcc_status=$?

  if (( HCC_CARD_OPEN && hcc_status == 1 && HCC_OUTPUT_MARKED == 0 )); then
    local -i hcc_indent
    hcc_indent=$(_hcc_prompt_columns)

    (( hcc_indent < 0 )) &&
      hcc_indent=0

    (( hcc_indent > 999 )) &&
      hcc_indent=999

    printf '\e]777;hcc;%s;indent;%03d\a' \
      "$HCC_SESSION_TOKEN" \
      "$hcc_indent"
    printf '\e]777;hcc;%s;output\a' \
      "$HCC_SESSION_TOKEN"
    hcc_status=130
  fi

  HCC_OUTPUT_MARKED=0

  if (( HCC_CLEAR_PENDING )); then
    HCC_CLEAR_PENDING=0
    HCC_CARD_OPEN=0
    HCC_OUTPUT_MARKED=0

    # Restore the cursor saved immediately before clear.
    printf '\e8\r'

    # The saved position is the editable prompt row. Move to
    # the row where Starship's prefix begins so its complete
    # multi-line prompt returns to the same location.
    printf '\e[%dA' \
      "$(( HCC_STARSHIP_PREFIX_ROWS + 1 ))"

    printf '\e]777;hcc;%s;prompt\a' \
      "$HCC_SESSION_TOKEN"

    HCC_CARD_OPEN=1
    return 0
  fi

  if (( HCC_CARD_OPEN )); then
    printf '\r\n'
    printf '\e]777;hcc;%s;done\a' \
      "$HCC_SESSION_TOKEN"
    printf '\e]777;hcc;%s;result;%d\a' \
      "$HCC_SESSION_TOKEN" \
      "$hcc_status"
    printf '\r\n\r\n'
  fi

  printf '\e]777;hcc;%s;prompt\a' \
    "$HCC_SESSION_TOKEN"
  printf '\r\n'

  HCC_CARD_OPEN=1
}

add-zsh-hook preexec _hcc_preexec
add-zsh-hook precmd _hcc_precmd

add-zsh-hook precmd _hcc_split_starship_prompt

# Split a multiline paste only when every nonblank line is
# a valid command on its own.
_hcc_accept_line() {
  emulate -L zsh

  if [[ $BUFFER != *$'\n'* ]]; then
    zle .accept-line
    return
  fi

  local -a hcc_lines
  local -a hcc_commands
  local hcc_line
  local hcc_buffer="$BUFFER"
  local -i hcc_i

  # A backslash followed by a newline is one logical shell
  # command line. Join those continuations before deciding
  # whether a paste contains multiple commands.
  hcc_buffer=${hcc_buffer//$'\\\n'/}

  hcc_lines=("${(@f)hcc_buffer}")

  for hcc_line in "${hcc_lines[@]}"; do
    if [[ -n "${hcc_line//[[:space:]]/}" ]]; then
      hcc_commands+=("$hcc_line")
    fi
  done

  # Treat comment-only lines as context for an adjacent command,
  # not as separate Hyper Cards.
  local -a hcc_merged_commands=()
  local hcc_pending_comments=""

  local hcc_trimmed_line

  for hcc_line in "${hcc_commands[@]}"; do
    hcc_trimmed_line="${hcc_line#"${hcc_line%%[![:space:]]*}"}"

    if [[ "$hcc_trimmed_line" == \#* ]]; then
      if [[ "$HCC_COMMENT_MODE" == "hide" ]]; then
        continue
      fi

      if [[ -n "$hcc_pending_comments" ]]; then
        hcc_pending_comments+=$'\n'
      fi

      hcc_pending_comments+="$hcc_line"
      continue
    fi

    if [[ -n "$hcc_pending_comments" ]]; then
      hcc_line="${hcc_pending_comments}"$'\n'"${hcc_line}"
      hcc_pending_comments=""
    fi

    hcc_merged_commands+=("$hcc_line")
  done

  # A trailing comment belongs to the preceding command. If the
  # paste contains only comments, leave it as one shell submission.
  if [[ -n "$hcc_pending_comments" ]]; then
    if (( ${#hcc_merged_commands[@]} )); then
      hcc_merged_commands[-1]+=$'\n'"$hcc_pending_comments"
    else
      hcc_merged_commands+=("$hcc_pending_comments")
    fi
  fi

  hcc_commands=("${hcc_merged_commands[@]}")

  if (( ${#hcc_commands[@]} < 2 )); then
    if (( ${#hcc_commands[@]} == 1 )); then
      BUFFER=${hcc_commands[1]}
      CURSOR=${#BUFFER}
    fi

    zle .accept-line
    return
  fi

  for hcc_line in "${hcc_commands[@]}"; do
    if ! command zsh -n -c "$hcc_line" >/dev/null 2>&1; then
      zle .accept-line
      return
    fi
  done

  HCC_GROUP_COUNTER=$(( HCC_GROUP_COUNTER + 1 ))
  HCC_ACTIVE_GROUP="$$-$HCC_GROUP_COUNTER"
  HCC_GROUP_INDEX=1
  HCC_GROUP_TOTAL=${#hcc_commands[@]}
  HCC_EXPECTED_GROUP_COMMAND=${hcc_commands[1]}

  HCC_COMMAND_QUEUE=()

  for (( hcc_i = 2;
         hcc_i <= ${#hcc_commands[@]};
         hcc_i++ )); do
    HCC_COMMAND_QUEUE+=(
      "${hcc_commands[hcc_i]}"
    )
  done

  BUFFER=${hcc_commands[1]}
  CURSOR=${#BUFFER}

  zle .accept-line
}

# Run one queued command when the next prompt is ready.
_hcc_line_init() {
  emulate -L zsh



  if (( ${#HCC_COMMAND_QUEUE[@]} == 0 )); then
    return
  fi

  local hcc_next=${HCC_COMMAND_QUEUE[1]}
  HCC_COMMAND_QUEUE[1]=()

  HCC_EXPECTED_GROUP_COMMAND="$hcc_next"

  zle -U "$hcc_next"$'\n'

  printf '\e]777;hcc;%s;ready\a' \
    "$HCC_SESSION_TOKEN"

}

_hcc_comments_show() {
  typeset -g HCC_COMMENT_MODE=show
}

_hcc_comments_hide() {
  typeset -g HCC_COMMENT_MODE=hide
}

zle -N _hcc_comments_show
zle -N _hcc_comments_hide

bindkey -M emacs $'\e[777;1~' _hcc_comments_show
bindkey -M viins $'\e[777;1~' _hcc_comments_show
bindkey -M vicmd $'\e[777;1~' _hcc_comments_show

bindkey -M emacs $'\e[777;2~' _hcc_comments_hide
bindkey -M viins $'\e[777;2~' _hcc_comments_hide
bindkey -M vicmd $'\e[777;2~' _hcc_comments_hide

zle -N _hcc_accept_line
zle -N _hcc_line_init

bindkey '^M' _hcc_accept_line
bindkey '^J' _hcc_accept_line

add-zle-hook-widget line-init _hcc_line_init

# Use fzf's zsh history widget with the Hyper Cards picker options.
_hcc_setup_history_picker() {
  emulate -L zsh

  if (( ! $+commands[fzf] )); then
    bindkey '^R' history-incremental-search-backward
    return
  fi

  local FZF_CTRL_T_COMMAND=""
  local FZF_ALT_C_COMMAND=""

  typeset -g FZF_CTRL_R_OPTS="
    --height=45%
    --layout=reverse
    --border=rounded
    --prompt='History › '
    --pointer='›'
    --marker='✓'
    --no-multi
    --cycle
    --info=inline-right
    --bind='up:up,down:down,ctrl-k:up,ctrl-j:down,esc:abort'
    --color='fg:#E6E8EA,bg:#212121,hl:#AFC4D8,fg+:#F2F3F4,bg+:#252A30,hl+:#AFC4D8,prompt:#A5B8D0,pointer:#95B8AE,marker:#8FBF88,border:#56616F,info:#AAB2BA'
  "

  if ! command fzf --zsh >/dev/null 2>&1; then
    bindkey '^R' history-incremental-search-backward
    return
  fi

  source <(command fzf --zsh)

  # Open Hyper Cards history without filtering by the current command line.
  _hcc_history_widget() {
    local hcc_buffer="$BUFFER"
    local hcc_cursor=$CURSOR

    BUFFER=""
    CURSOR=0

    zle fzf-history-widget
    local hcc_status=$?

    if (( hcc_status != 0 )); then
      BUFFER="$hcc_buffer"
      CURSOR=$hcc_cursor
    fi

    return $hcc_status
  }

  zle -N hcc-history-widget _hcc_history_widget

  # Hyper sends Ctrl-G to open the history picker.
  bindkey -M emacs '^G' hcc-history-widget
  bindkey -M viins '^G' hcc-history-widget
  bindkey -M vicmd '^G' hcc-history-widget
}

_hcc_setup_history_picker
unfunction _hcc_setup_history_picker

# Give a new Hyper shell the same top spacing used after clear.
if [[ -o interactive && -z ${HCC_STARTUP_PAD_DONE:-} ]]; then
  typeset -g HCC_STARTUP_PAD_DONE=1
  printf '\n\n\n'
fi

