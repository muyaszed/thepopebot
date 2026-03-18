#!/bin/bash
# Start Pi in tmux, serve via ttyd (workspace runtime only)

tmux -u new-session -d -s pi 'pi'
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t pi
