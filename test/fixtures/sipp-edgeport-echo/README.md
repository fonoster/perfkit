# sipp-edgeport-echo

Raw output of a real SIPp run, used to test the SIPp parsers and the capacity step attribution.
The `uac_invite_echo_1_*` files are exactly as SIPp wrote them; `meta.json` was written by hand
from the run's start time (the stat file's `StartTime`) and the 60 s rate interval, the way the
orchestration writes it on a real run.

## How it was recorded

On 2026-11-03, on a laptop (arm64, Docker Desktop, the amd64 image under emulation), with SIPp
`pumpagubben/sipp:3.7.3@sha256:ceeff6749d6eb02b11776d3417cffe92235d4cac398d3209855a7bb77f585dd1`
(`SIPP_IMAGE` in `src/tools.ts`; it reports `SIPp v3.7.3-27-gdde43e1`).

**The system under test was a SIPp UAS, not EdgePort + Echo.** On the 2.31.5 images Echo's 200 OK
to an INVITE carries no Contact header, so EdgePort refuses to send it and an INVITE, 200, ACK,
BYE call never completes. The UAS (`../scenarios/uas_answer_echo.xml`) answers like Echo
would: 200 OK to the INVITE, takes the ACK, 200 OK to the BYE. SIPp writes the same files
whatever answers it, so the parsers see the same format.

```sh
docker network create pk-p2-net
docker run -d --name pk-p2-uas --network pk-p2-net -v "$PWD:/work" -w /work "$SIPP_IMAGE" \
  /sipp/sipp -sf uas_answer_echo.xml -t u1 -p 5060 -buff_size 4194304 -nostdin -trace_err
docker run --name pk-p2-uac --network pk-p2-net -v "$PWD:/work" -w /work "$SIPP_IMAGE" \
  /sipp/sipp pk-p2-uas:5060 -sf uac_invite_echo.xml -nostdin -timeout 180s \
  -t u1 -buff_size 4194304 -trace_rtt -rtt_freq 1000 -trace_stat -fd 10 -trace_counts \
  -trace_err -trace_error_codes -r 50 -rp 1000 -rate_increase 50 -rate_interval 60 \
  -rate_max 150 -no_rate_quit -d 1000
```

with both scenarios from `../scenarios/` in the working directory. The image's entrypoint is
not SIPp: the binary is `/sipp/sipp`. `-timeout 180s` ends the run after the 3 minutes.

17,947 calls, none failed: 50, 100 and 150 calls/s for 60 s each.

## Files

| File | SIPp flag | Notes |
| :--- | :--- | :--- |
| `uac_invite_echo_1_rtt.csv` | `-trace_rtt` | `Date_ms;response_time_ms;rtd_no`: ms since SIPp started, the rtd's time in whole ms, and the rtd number. One row per call. |
| `uac_invite_echo_1_.csv` | `-trace_stat -fd 10` | One row every 10 s; times are `date<TAB>time<TAB>epoch`. |
| `uac_invite_echo_1_counts.csv` | `-trace_counts` | Per-message counts. Not read by perfkit. |
| `uac_invite_echo_1_error_codes.csv` | `-trace_error_codes` | Only the header and time rows, since no call failed. Not read by perfkit. |

`-trace_err` wrote no `_errors.log`: SIPp creates it only on the first error.
