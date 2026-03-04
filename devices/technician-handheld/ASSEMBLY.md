# Technician Handheld -- Hardware Assembly Guide

Device: Raspberry Pi 5 + Touch Display 2 portable handheld unit.

---

## Bill of Materials

| # | Component | Specification | Qty | Est. Price (USD) |
|---|-----------|---------------|-----|-------------------|
| 1 | Raspberry Pi 5 | 4GB or 8GB RAM | 1 | $60 -- $80 |
| 2 | Raspberry Pi Touch Display 2 | 7" 720x1280, DSI interface | 1 | $60 |
| 3 | 22-to-15-pin FFC Adapter | Included with Touch Display 2 | 1 | -- |
| 4 | M2.5 Standoffs + Screws | Included with Touch Display 2 (4x standoffs, 8x screws) | 1 set | -- |
| 5 | microSD Card | 32GB+ A2 class (e.g., SanDisk Extreme) | 1 | $10 -- $15 |
| 6 | USB-C PD Power Bank | 5V/3A minimum, 10,000--20,000 mAh | 1 | $25 -- $50 |
| 7 | USB-C 5.1V/5A PSU | Official Raspberry Pi 27W PSU recommended (initial setup only) | 1 | $12 |
| 8 | USB-C Cable | For power bank to Pi 5 connection (if not included with power bank) | 1 | $5 -- $8 |

**Estimated total: $172 -- $225** (depending on Pi 5 RAM variant and power bank capacity)

---

## Prerequisites

- A workstation with a microSD card reader.
- Raspberry Pi Imager (v1.8+) installed on the workstation.
- An anti-static wrist strap or ESD mat. The Pi 5 and display are sensitive to electrostatic discharge.
- A small Phillips-head screwdriver (for M2.5 screws).

---

## Step 1: Flash the microSD Card

1. Insert the microSD card into the workstation card reader.
2. Open Raspberry Pi Imager.
3. Select **Raspberry Pi 5** as the device.
4. Select **Raspberry Pi OS (64-bit)** -- Bookworm-based, Desktop variant.
5. Select the target microSD card.
6. Click the gear icon (or "Edit Settings") to pre-configure:
   - Hostname (e.g., `tech-handheld-01`)
   - Username and password
   - Wi-Fi SSID and password
   - Locale and timezone
   - Enable SSH (recommended)
7. Write the image. Wait for verification to complete before ejecting.

**Note:** Always use the 64-bit Desktop variant. The Touch Display 2 requires a graphical environment for touch input calibration. Do NOT use Lite images for this device.

---

## Step 2: Mount Pi 5 on Touch Display 2

**CAUTION -- ESD:** Handle the Pi 5 and display by their edges. Ground yourself before touching any components.

1. Place the Touch Display 2 face-down on a clean, soft surface (use an anti-static bag or cloth to protect the screen).
2. Locate the four threaded standoff mounting points on the rear of the display PCB.
3. Thread the four M2.5 metal standoffs into the display PCB mounting holes. Hand-tighten, then snug with a screwdriver. Do not overtighten.
4. Orient the Pi 5 so that:
   - The USB and Ethernet ports face the same edge as the display ribbon cable connector.
   - The DSI DISP1 connector on the Pi 5 aligns with the display's FFC connector side.
5. Place the Pi 5 onto the standoffs with the GPIO header facing upward (away from the display).
6. Secure the Pi 5 with four M2.5 screws through the Pi 5 mounting holes into the standoffs. Tighten in a cross pattern (diagonal pairs) to ensure even pressure. Do not overtighten -- the PCB should be snug but not flexed.

---

## Step 3: Connect the FFC Ribbon Cable

**CAUTION:** FFC ribbon cables are fragile. Do not crease, twist, or force them. Damaged cables cause intermittent display failures that are difficult to diagnose.

1. Locate the **22-to-15-pin FFC adapter cable** (included with Touch Display 2). This adapter is required because the Pi 5 uses a 15-pin DSI connector while the Touch Display 2 has a 22-pin connector.
2. On the **Touch Display 2 PCB**, lift the FFC connector latch gently (flip it upward about 90 degrees).
3. Insert the **22-pin end** of the adapter cable into the display connector. The exposed contacts must face toward the display PCB (face down). The blue reinforcement strip faces upward.
4. Press the latch closed. The cable should be held firmly with no play.
5. On the **Pi 5**, locate the **DISP1** connector (the one closer to the HDMI ports -- not the CAM connector).
6. Lift the DISP1 FFC connector latch gently.
7. Insert the **15-pin end** of the adapter cable into the DISP1 connector. The exposed contacts face toward the Pi 5 PCB (face down).
8. Press the latch closed firmly.

**Verification:** Gently tug the cable at each end. It should not slide out. If it moves, reopen the latch and reseat it.

---

## Step 4: Connect Power Jumper Cable

The Touch Display 2 can be powered from the Pi 5 GPIO header, eliminating the need for a separate display power supply.

1. Locate the power jumper cable (two-wire JST-style cable, included with Touch Display 2).
2. Connect one end to the **power input connector** on the Touch Display 2 PCB (labeled `5V` and `GND`).
3. Connect the other end to the Pi 5 GPIO header:
   - **Red wire** to **Pin 2** (5V power) -- physical pin 2, top-right when GPIO is facing you.
   - **Black wire** to **Pin 6** (Ground) -- physical pin 6, three pins down on the same side.

**CAUTION:** Double-check the pin numbers before powering on. Connecting 5V to the wrong pin can permanently damage the Pi 5 or the display. Refer to the official Pi 5 GPIO pinout diagram.

| Wire Color | GPIO Pin | Function |
|------------|----------|----------|
| Red | Pin 2 | 5V Power |
| Black | Pin 6 | GND |

---

## Step 5: Initial Setup (Wired Power)

1. Insert the flashed microSD card into the Pi 5 microSD slot (on the underside of the board, opposite the USB ports).
2. Connect the **USB-C 5.1V/5A PSU** to the Pi 5 USB-C power input.
3. The system will boot. The Touch Display 2 should activate within 5--10 seconds showing the boot sequence.
4. Complete the Raspberry Pi OS first-boot wizard if it appears.
5. Verify touch input by tapping the screen. The Touch Display 2 uses DSI for both video and touch -- no additional drivers are needed on Bookworm.

### Post-Boot Configuration

Open a terminal (on-screen or via SSH) and run:

```bash
sudo apt update && sudo apt full-upgrade -y
```

Verify display detection:

```bash
# Check that the DSI display is recognized
kmsprint | grep -i dsi

# Check touch input device
libinput list-devices | grep -i touch
```

If the display orientation is incorrect (the Touch Display 2 defaults to portrait 720x1280), rotate it:

```bash
# For landscape orientation, add to /boot/firmware/config.txt:
# display_lcd_rotate=2
# Or use Screen Configuration tool in desktop: Preferences > Screen Configuration
```

**Note on screen rotation:** The Touch Display 2 is natively portrait (720x1280). For a landscape handheld configuration, you will likely want to rotate the display 90 or 270 degrees depending on your mounting orientation. Touch input rotates automatically with the display setting.

---

## Step 6: Portable Power Configuration

Once initial setup and software configuration are complete:

1. Disconnect the USB-C PSU.
2. Connect the **USB-C PD power bank** to the Pi 5 USB-C power input port.
3. Ensure the power bank supports **5V/3A output** at minimum. The Pi 5 negotiates USB-C PD and will throttle if insufficient current is available.
4. The system should boot normally from battery power.

**CAUTION:** The Pi 5 will display a low-voltage warning icon (lightning bolt) on screen if the power bank cannot supply sufficient current. If this appears, use a higher-rated power bank. Sustained undervoltage causes SD card corruption and unstable operation.

---

## Power Budget

| Component | Idle Power | Active Power | Peak Power |
|-----------|-----------|--------------|------------|
| Raspberry Pi 5 (4GB) | ~4.0 W | ~6.0 W | ~7.5 W |
| Raspberry Pi 5 (8GB) | ~4.2 W | ~6.5 W | ~7.5 W |
| Touch Display 2 | ~1.0 W | ~1.5 W | ~2.0 W |
| **Total (4GB)** | **~5.0 W** | **~7.5 W** | **~9.5 W** |
| **Total (8GB)** | **~5.2 W** | **~8.0 W** | **~9.5 W** |

### Battery Runtime Estimates

Assuming 85% power bank discharge efficiency and average active workload (~7.5 W total draw):

| Power Bank Capacity | Usable Energy | Estimated Runtime |
|---------------------|---------------|-------------------|
| 10,000 mAh (50 Wh) | ~42.5 Wh | ~5.5 hours |
| 15,000 mAh (75 Wh) | ~63.75 Wh | ~8.5 hours |
| 20,000 mAh (100 Wh) | ~85 Wh | ~11 hours |

**Notes:**
- Runtime decreases under sustained heavy CPU/GPU load.
- Wi-Fi and Bluetooth active use adds ~0.5--1.0 W.
- Screen brightness affects display power draw. Lower brightness extends runtime.
- These are estimates. Actual runtime depends on workload, power bank quality, ambient temperature, and cable resistance.

---

## Troubleshooting

### Display is black / no backlight

1. Verify the FFC ribbon cable is fully seated at both ends. Open each latch, reseat, and re-latch.
2. Confirm the cable orientation -- exposed contacts face the PCB at both connectors.
3. Verify the power jumper cable is connected to the correct GPIO pins (Pin 2 and Pin 6).
4. Try a different FFC adapter cable if available. These cables are fragile and can develop micro-fractures.

### Display has backlight but no image

1. Ensure the FFC cable is connected to **DISP1**, not the camera (CAM) connector.
2. Check that the microSD card is properly inserted and contains a valid OS image.
3. Connect an HDMI monitor to verify the Pi 5 is booting. If HDMI works but DSI does not, the FFC cable or adapter is likely at fault.

### Touch input not working

1. Touch is delivered over the same DSI connection as video. If the display shows an image, touch should work. Reseat the FFC cable.
2. Verify with `libinput list-devices`. If no touch device appears, the DSI connection is incomplete.
3. Ensure you are running Raspberry Pi OS Bookworm. Older OS versions may lack Touch Display 2 drivers.

### Low voltage warning (lightning bolt icon)

1. Use a power bank that supports 5V/3A or higher output.
2. Use a short, high-quality USB-C cable (under 1 meter, USB-IF certified).
3. Avoid running heavy CPU loads while on marginal power sources.

### Pi 5 does not boot

1. Re-flash the microSD card. Use a known-good A2-rated card.
2. Verify the PSU or power bank output. Measure with a USB-C power meter if available.
3. Remove the display and FFC cable, then attempt to boot with HDMI only. If it boots, the issue is with the display connection or power draw.
4. Check for visible damage on the Pi 5 (burnt components, bent pins).

### Screen orientation is wrong

1. Edit `/boot/firmware/config.txt` and add `display_lcd_rotate=2` for 180-degree rotation, or use the desktop Screen Configuration utility.
2. Reboot after changes.
3. Touch input should auto-rotate with the display. If touch coordinates are misaligned after rotation, run `xinput_calibrator` (install with `sudo apt install xinput-calibrator`).

---

## Assembly Checklist

Use this checklist to verify the build is complete:

- [ ] microSD flashed with Raspberry Pi OS Bookworm 64-bit (Desktop)
- [ ] Pi 5 mounted on display standoffs with 4x M2.5 screws
- [ ] FFC adapter cable connected: 22-pin end to display, 15-pin end to Pi 5 DISP1
- [ ] Power jumper cable connected: Red to Pin 2 (5V), Black to Pin 6 (GND)
- [ ] microSD inserted into Pi 5
- [ ] Initial boot completed with USB-C PSU
- [ ] OS updated (`apt full-upgrade`)
- [ ] Display output verified (image visible on Touch Display 2)
- [ ] Touch input verified (tap responds correctly)
- [ ] Portable power verified (boots and runs from USB-C power bank)
