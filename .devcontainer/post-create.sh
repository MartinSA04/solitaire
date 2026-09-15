#!/usr/bin/env bash
set -euo pipefail

# A freshly created volume is root-owned — hand node_modules to the remote user
# before anything tries to write into it, or pnpm fails with EACCES.
sudo chown -R "$(whoami)" node_modules 2>/dev/null || true

# Provision the toolchain pinned in mise.toml. `mise` itself is on PATH here,
# but the tools it manages are NOT auto-activated in this non-interactive shell
# (`mise activate` only runs for interactive shells), so every step below that
# needs node/pnpm goes through `mise exec --`.
mise trust && mise install
mise exec -- pnpm install

# Chromium + its apt system libs for `pnpm test:e2e` — the SAME command CI runs
# (.github/workflows/ci.yml), so a local run and a CI run drive the same build.
# `--with-deps` shells out to `sudo apt-get`; the vscode user has passwordless
# sudo, so it runs unattended. Browsers land in ~/.cache/ms-playwright, which is
# outside the node_modules volume, so this reruns on each rebuild — correct,
# since the apt libs reset with the image anyway.
mise exec -- pnpm exec playwright install --with-deps chromium

# GitHub auth over SSH: use only ~/.ssh/id_git (bind-mounted read-only from the
# host). `IdentitiesOnly yes` makes ssh ignore every other key the forwarded
# agent offers, so the correct key is always used for github.com — otherwise a
# read-only deploy key can win the handshake and block pushes.
sudo install -d -m 700 -o "$(whoami)" -g "$(whoami)" "$HOME/.ssh"
cat > "$HOME/.ssh/config" <<'SSHCONF'
Host github.com
  User git
  IdentityFile ~/.ssh/id_git
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
SSHCONF
chmod 600 "$HOME/.ssh/config"
