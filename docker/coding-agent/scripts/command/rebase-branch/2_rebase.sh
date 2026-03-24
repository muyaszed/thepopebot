#!/bin/bash
cd /home/coding-agent/workspace

BRANCH="${BRANCH:-main}"

git fetch origin

git rebase "origin/${BRANCH}"
