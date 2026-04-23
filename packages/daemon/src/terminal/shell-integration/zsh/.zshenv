typeset -g SKYNET_SHELL_INTEGRATION_DIR="${${(%):-%N}:A:h}"

if [[ -n "${SKYNET_ZSH_ZDOTDIR-}" ]]; then
  export ZDOTDIR="${SKYNET_ZSH_ZDOTDIR}"
else
  unset ZDOTDIR
fi

if [[ -n "${ZDOTDIR-}" ]]; then
  if [[ -f "${ZDOTDIR}/.zshenv" ]]; then
    source "${ZDOTDIR}/.zshenv"
  fi
elif [[ -f "${HOME}/.zshenv" ]]; then
  source "${HOME}/.zshenv"
fi

source "${SKYNET_SHELL_INTEGRATION_DIR}/skynet-integration.zsh"
