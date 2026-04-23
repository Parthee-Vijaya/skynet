if [[ -n "${_SKYNET_ZSH_INTEGRATION_LOADED-}" ]]; then
  return
fi
typeset -g _SKYNET_ZSH_INTEGRATION_LOADED=1

autoload -Uz add-zsh-hook

typeset -g _SKYNET_ZSH_COMMAND_ACTIVE=0

function _skynet_osc633() {
  printf '\e]633;%s\a' "$1"
}

function _skynet_precmd() {
  local command_status=$?
  if [[ "$_SKYNET_ZSH_COMMAND_ACTIVE" == "1" ]]; then
    _skynet_osc633 "D;${command_status}"
    _SKYNET_ZSH_COMMAND_ACTIVE=0
  fi
  printf '\e]2;%s\a' "${PWD/#$HOME/~}"
  _skynet_osc633 "A"
}

function _skynet_preexec() {
  _SKYNET_ZSH_COMMAND_ACTIVE=1
  _skynet_osc633 "B"
  _skynet_osc633 "C"
  printf '\e]2;%s\a' "$1"
}

add-zsh-hook precmd _skynet_precmd
add-zsh-hook preexec _skynet_preexec
