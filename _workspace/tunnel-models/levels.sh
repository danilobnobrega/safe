#!/usr/bin/env bash
# every detail level of every tunnel object, for /lab.html — textures always at their original
# resolution (the lab scales them down live); levels: orig (as authored), hi, mid, lo
set -u
B="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
OUT="C:/Users/GETÚLIO/generic/public/hero/lab"
mkdir -p "$OUT"
export MAX_TEX=16384
run() { # name size level faces [keep]
  local name=$1 size=$2 level=$3 faces=$4 keep=${5:-}
  local raw=0; [ "$level" = orig ] && raw=1
  OUTFILE="$OUT/${name}_${level}.glb" RAW=$raw timeout 1500 "$B" -b --python prep.py -- "$name" "$size" "$OUT" "$faces" $keep 2>&1 | grep -E "^PREP|Error|Traceback"
}
# tennis ball: the original keeps its million-odd felt hairs; the other levels are the core
run tennis_ball_2 0.067 orig 99999999
run tennis_ball_2 0.067 hi 99999999 Object_2
run tennis_ball_2 0.067 mid 3500 Object_2
run tennis_ball_2 0.067 lo 1200 Object_2
for spec in "racket_blade_team 0.685 7000 3000 1200" "tt_racket_joola 0.26 99999999 700 400" "shoe_pegasus 0.29 30000 12000 5000" "galaxy_watch 0.4 14000 6000 2500" "laptop 0.304 18000 8000 3000"; do
  set -- $spec
  run $1 $2 orig 99999999
  run $1 $2 hi $3
  run $1 $2 mid $4
  run $1 $2 lo $5
done
echo ALLDONE
