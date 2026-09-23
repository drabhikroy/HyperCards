# Hyper Command Cards shell integration.

if [[ -n ${HCC_LOADED:-} ]]; then
  return 0
fi

typeset -g HCC_LOADED=1
typeset -g HCC_CARD_OPEN=0
typeset -ga HCC_COMMAND_QUEUE=()
typeset -gi HCC_GROUP_COUNTER=0
typeset -g HCC_ACTIVE_GROUP=""
typeset -gi HCC_GROUP_INDEX=0
typeset -gi HCC_GROUP_TOTAL=0

PROMPT_EOL_MARK=''

autoload -Uz add-zsh-hook
autoload -Uz add-zle-hook-widget

_hcc_preexec() {
  printf '\r\n'

  if [[ -n ${HCC_ACTIVE_GROUP:-} ]]; then
    printf '\e]777;hcc;group;%s;%d;%d\a' \
      "$HCC_ACTIVE_GROUP" \
      "$HCC_GROUP_INDEX" \
      "$HCC_GROUP_TOTAL"

    if (( HCC_GROUP_INDEX >= HCC_GROUP_TOTAL )); then
      HCC_ACTIVE_GROUP=""
      HCC_GROUP_INDEX=0
      HCC_GROUP_TOTAL=0
    else
      HCC_GROUP_INDEX=$(( HCC_GROUP_INDEX + 1 ))
    fi
  fi

  printf '\e]777;hcc;output\a'
}

_hcc_precmd() {
  local hcc_status=$?

  if (( HCC_CARD_OPEN )); then
    printf '\r\n'
    printf '\e]777;hcc;done\a'
    printf '\e]777;hcc;result;%d\a' "$hcc_status"
    printf '\r\n\r\n'
  fi

  printf '\e]777;hcc;prompt\a'
  printf '\r\n'

  HCC_CARD_OPEN=1
}

add-zsh-hook preexec _hcc_preexec
add-zsh-hook precmd _hcc_precmd

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
  local -i hcc_i

  hcc_lines=("${(@f)BUFFER}")

  for hcc_line in "${hcc_lines[@]}"; do
    if [[ -n "${hcc_line//[[:space:]]/}" ]]; then
      hcc_commands+=("$hcc_line")
    fi
  done

  if (( ${#hcc_commands[@]} < 2 )); then
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

  zle -U "$hcc_next"$'\n'
}

zle -N _hcc_accept_line
zle -N _hcc_line_init

bindkey '^M' _hcc_accept_line
bindkey '^J' _hcc_accept_line

add-zle-hook-widget line-init _hcc_line_init

# Use fzf's zsh history widget while keeping the HCC visual style.
_hcc_setup_history_picker() {
  emulate -L zsh

  if (( ! $+commands[fzf] )); then
    bindkey '^R' history-incremental-search-backward
    return
  fi

  local FZF_CTRL_T_COMMAND=""
  local FZF_ALT_C_COMMAND=""

  local FZF_CTRL_R_OPTS="
    --height=45%
    --layout=reverse
    --border=rounded
    --prompt='History › '
    --pointer='›'
    --marker='✓'
    --no-multi
    --cycle
    --info=inline-right
    --bind='ctrl-]:abort,esc:abort'
    --color='fg:#E6E8EA,bg:#212121,hl:#AFC4D8,fg+:#F2F3F4,bg+:#252A30,hl+:#AFC4D8,prompt:#A5B8D0,pointer:#95B8AE,marker:#8FBF88,border:#56616F,info:#AAB2BA'
  "

  local integration
  integration="$(
    command fzf --zsh 2>/dev/null
  )"

  if [[ -z $integration ]]; then
    bindkey '^R' history-incremental-search-backward
    return
  fi

  eval "$integration"

  # Private bridge for the Mac-native Command-R history shortcut.
  bindkey -M emacs '^G' fzf-history-widget
  bindkey -M viins '^G' fzf-history-widget
  bindkey -M vicmd '^G' fzf-history-widget

  # Private transport used by the Hyper ⌘R history shortcut.
  bindkey -M emacs '^]' fzf-history-widget
  bindkey -M viins '^]' fzf-history-widget
  bindkey -M vicmd '^]' fzf-history-widget
}

_hcc_setup_history_picker
unfunction _hcc_setup_history_picker

# Give a new Hyper shell the same top spacing used after clear.
if [[ -o interactive && -z ${HCC_STARTUP_PAD_DONE:-} ]]; then
  typeset -g HCC_STARTUP_PAD_DONE=1
  printf '\n\n\n'
fi

