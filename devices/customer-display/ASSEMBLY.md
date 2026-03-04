# Customer Display -- Hardware Assembly Guide

Device: Raspberry Pi Zero 2 W + HyperPixel 4.0 Square compact display unit with PiSugar 3 battery.

---

## Bill of Materials

| # | Component | Specification | Qty | Est. Price (USD) |
|---|-----------|---------------|-----|-------------------|
| 1 | Raspberry Pi Zero 2 W | With pre-soldered 40-pin header (or solder header yourself) | 1 | $20 |
| 2 | Pimoroni HyperPixel 4.0 Square | Touch variant, 720x720, DPI interface | 1 | $55 |
| 3 | PiSugar 3 | 1200 mAh, Pi Zero form factor (65x30mm), pogo pin connection | 1 | $40 |
| 4 | microSD Card | 16GB+ A1 class (e.g., SanDisk Ultra) | 1 | $7 -- $10 |
| 5 | USB-C Cable | For charging PiSugar 3 | 1 | $5 |
| 6 | 40-Pin GPIO Header | Only if Pi Zero 2 W does not have pre-soldered header | 1 | $1 -- $3 |
| 7 | M2.5 Screws (8mm) | For securing PiSugar 3 to Pi Zero 2 W (included with PiSugar 3) | 4 | -- |

**Estimated total: $127 -- $133**

---

## Prerequisites

- A workstation with a microSD card reader.
- Raspberry Pi Imager (v1.8+) installed on the workstation.
- Anti-static wrist strap or ESD mat.
- Small Phillips-head screwdriver (for M2.5 screws).
- Soldering iron and solder (only if the Pi Zero 2 W does not have a pre-soldered header).

---

## Important Constraints

Read these before beginning assembly:

1. **OS Version:** The Pi Zero 2 W with HyperPixel 4.0 Square requires **Raspberry Pi OS Legacy Lite (Bullseye 32-bit)**. Do NOT use Bookworm. The HyperPixel DPI driver requires the legacy display stack (fkms/kms) available in Bullseye. Bookworm's default display pipeline is incompatible with the HyperPixel DPI interface on the Zero 2 W.

2. **GPIO Availability:** The HyperPixel 4.0 Square uses **ALL 40 GPIO pins** for its DPI parallel display interface. No GPIO pins are available for other peripherals once the HyperPixel is attached. Plan any additional hardware connectivity through USB or wireless only.

3. **RAM Constraint:** The Pi Zero 2 W has 512 MB RAM (non-upgradeable). Use the Lite (no desktop) OS image to minimize memory consumption. Applications must be designed for this constraint.

4. **Physical Dimensions:** Assembled unit is approximately 84mm x 84mm face (HyperPixel footprint) and ~30mm deep (PiSugar + Pi Zero 2 W + HyperPixel stack).

---

## Step 1: Flash the microSD Card

1. Insert the microSD card into the workstation card reader.
2. Open Raspberry Pi Imager.
3. Select **Raspberry Pi Zero 2 W** as the device.
4. Select **Raspberry Pi OS (Legacy, 32-bit) Lite** -- this is the Bullseye-based headless image. It will be listed under "Raspberry Pi OS (other)."
5. Select the target microSD card.
6. Click the gear icon (or "Edit Settings") to pre-configure:
   - Hostname (e.g., `cust-display-01`)
   - Username and password
   - Wi-Fi SSID and password (required -- the Zero 2 W has no Ethernet)
   - Locale and timezone
   - Enable SSH (required for headless configuration)
7. Write the image. Wait for verification to complete.

**Do NOT eject the card yet.** Proceed to Step 1a.

### Step 1a: Pre-configure HyperPixel Display Overlay

Before ejecting the microSD card, configure the display overlay so the HyperPixel works on first boot:

1. Open the `config.txt` file on the boot partition of the microSD card. The boot partition will appear as a readable FAT32 volume on the workstation.
   - On Linux/macOS: mount point varies, look for `/boot` or `/media/<user>/bootfs`
   - On Windows: the boot partition appears as a drive letter
2. Add the following line at the end of `config.txt`:
   ```
   dtoverlay=vc4-kms-dpi-hyperpixel4sq
   ```
3. Save the file.
4. Safely eject the microSD card.

**Note:** If you skip this step, the HyperPixel display will show nothing on first boot. You can still SSH in over Wi-Fi to add the overlay later, but it is simpler to do it now.

---

## Step 2: Mount PiSugar 3 on Pi Zero 2 W

The PiSugar 3 attaches to the **underside** of the Pi Zero 2 W. It uses pogo pins that press against test pads on the bottom of the Pi board -- no soldering required for the battery connection.

1. Place the Pi Zero 2 W component-side up on a flat surface.
2. Orient the PiSugar 3 so that:
   - The USB-C charging port on the PiSugar aligns with the same edge as the Pi Zero 2 W's micro-USB ports.
   - The four mounting holes on the PiSugar align with the four mounting holes on the Pi Zero 2 W.
   - The pogo pins on the PiSugar face upward (toward the Pi Zero 2 W underside).
3. Flip the Pi Zero 2 W upside down and place it onto the PiSugar 3, aligning the mounting holes.
4. Verify the pogo pins on the PiSugar 3 make contact with the corresponding test pads on the Pi Zero 2 W underside (5V, GND, SDA, SCL pads).
5. Secure with **4x M2.5 screws** through the mounting holes. Tighten evenly in a cross pattern. The screws go through the Pi Zero 2 W holes and thread into the PiSugar 3 standoffs.

**CAUTION:** Do not overtighten. The Pi Zero 2 W PCB is thin and can crack under excessive pressure. The screws should be snug -- stop as soon as resistance is felt.

**Verification:** The PiSugar 3 status LED should be visible from the side. The Pi Zero 2 W should sit flat and stable on top of the PiSugar.

---

## Step 3: Attach HyperPixel 4.0 Square Display

**CAUTION -- ESD:** Ground yourself. The HyperPixel connects directly to the GPIO header and ESD can damage either board.

1. Ensure the Pi Zero 2 W has a **40-pin GPIO header** soldered. If it does not, solder one now before proceeding. The header must be on the top side (component side) of the Pi Zero 2 W with pins facing upward.
2. Orient the HyperPixel 4.0 Square so that:
   - The display faces upward (away from the Pi).
   - The HyperPixel's 40-pin socket aligns with the Pi's 40-pin header.
   - The HyperPixel PCB extends over the Pi Zero 2 W (the HyperPixel is larger than the Pi Zero).
3. Align the socket carefully with the header pins. Ensure all 40 pins line up -- misalignment will bend pins and potentially short connections.
4. Press down **firmly and evenly** with both thumbs on opposite edges of the HyperPixel board. Do not press on the display surface itself. Apply force to the PCB edges near the GPIO connector.
5. The HyperPixel should seat fully onto the header with no pin tips visible above the socket.

**CAUTION:** This connection is tight by design. It takes firm, even pressure. Do NOT rock the board side to side -- press straight down. If pins bend, carefully straighten them with needle-nose pliers before reattempting.

**CAUTION:** Once seated, the HyperPixel is difficult to remove. To detach, pry gently and evenly from both sides using a plastic spudger. Never pull from one side only.

---

## Step 4: Insert microSD and Charge

1. Insert the pre-configured microSD card into the Pi Zero 2 W microSD slot. The slot is on the bottom edge of the Pi Zero 2 W, accessible from the side of the assembled stack.
2. Connect a USB-C cable to the **PiSugar 3 USB-C port** to charge the battery.
3. The PiSugar 3 can simultaneously charge and power the Pi. The Pi Zero 2 W will boot during charging.

**Note:** Allow the PiSugar 3 to charge for at least 30 minutes before relying on battery power. A full charge from empty takes approximately 2--3 hours.

---

## Step 5: First Boot and Verification

### Power On

1. Press the PiSugar 3 power button (if the Pi did not auto-start during charging).
2. The Pi Zero 2 W green activity LED (visible through gaps in the stack) should begin blinking, indicating boot activity.
3. The HyperPixel display should illuminate within 10--20 seconds if the `config.txt` overlay was configured correctly.

### SSH Access

Since this is a Lite (headless) image, initial configuration is done over SSH:

```bash
# From the workstation, connect via the hostname set during imaging:
ssh <username>@cust-display-01.local

# If mDNS does not resolve, find the IP from your router's DHCP client list
# or use: nmap -sn 192.168.x.0/24
```

### Verify Display

```bash
# Check that the HyperPixel overlay loaded
dmesg | grep -i hyperpixel

# Verify framebuffer exists
ls -la /dev/fb*
# Should show /dev/fb0

# Quick display test -- fill screen with a color
sudo apt install -y fbi
# Create a test image and display it, or:
cat /dev/urandom > /dev/fb0 2>/dev/null
# Screen should show random noise (static). Press Ctrl+C.
```

### Verify Wi-Fi

```bash
# Check connection
iwconfig wlan0

# Test connectivity
ping -c 3 8.8.8.8
```

### Verify PiSugar 3

The PiSugar 3 communicates over I2C. Install the PiSugar management software:

```bash
curl https://cdn.pisugar.com/release/pisugar-power-manager.sh | sudo bash
```

Then check battery status:

```bash
# PiSugar web interface will be available at http://<hostname>:8421
# Or check via command line:
echo "get battery" | nc -q 0 127.0.0.1 8423
echo "get battery_charging" | nc -q 0 127.0.0.1 8423
```

---

## Physical Dimensions

| Dimension | Measurement |
|-----------|-------------|
| Face (display area) | 84mm x 84mm |
| Depth (full stack) | ~30mm |
| Weight (assembled, approximate) | ~85g |

Stack order (bottom to top):
```
+---------------------------+
|   HyperPixel 4.0 Square  |  (top -- display faces up)
+---------------------------+
|   Pi Zero 2 W             |  (middle)
+---------------------------+
|   PiSugar 3 (1200mAh)    |  (bottom -- USB-C port accessible)
+---------------------------+
```

---

## Power Budget

| Component | Idle Current (5V) | Active Current (5V) |
|-----------|-------------------|---------------------|
| Pi Zero 2 W | ~100 mA | ~250 mA |
| HyperPixel 4.0 Square | ~180 mA | ~200 mA |
| **Total** | **~280 mA** | **~450 mA** |

Idle: display on, Wi-Fi connected, minimal CPU activity.
Active: Wi-Fi transmitting, CPU under moderate load, display updating.

### Battery Runtime Estimates (PiSugar 3, 1200 mAh)

Assuming ~90% battery discharge efficiency:

| Usage Profile | Current Draw | Estimated Runtime |
|---------------|-------------|-------------------|
| Idle (display on, Wi-Fi standby) | ~280 mA | ~3.5 -- 4 hours |
| Active (moderate CPU + Wi-Fi) | ~450 mA | ~2 -- 2.5 hours |
| Heavy (sustained CPU + Wi-Fi TX) | ~550 mA | ~1.5 -- 2 hours |

**Notes:**
- The Pi Zero 2 W's quad-core can spike to ~550 mA under full load.
- Disabling Wi-Fi when not needed saves ~30--50 mA.
- The PiSugar 3 supports scheduled wake-up via RTC, enabling deep sleep strategies to extend effective battery life significantly.
- Runtime estimates assume a healthy, fully charged battery. Capacity degrades over charge cycles.

---

## Troubleshooting

### Display is completely black (no backlight)

1. Verify the `dtoverlay=vc4-kms-dpi-hyperpixel4sq` line is present in `/boot/config.txt`. SSH in to check.
2. Confirm the HyperPixel is fully seated on the GPIO header. Remove and reseat if necessary.
3. Verify the microSD card has a valid OS image by testing in another Pi.

### Display shows garbled image / color noise / vertical lines

This is the most common HyperPixel issue and almost always indicates an OS or overlay problem.

1. **Wrong OS version.** Confirm you are running **Bullseye (Legacy)**, not Bookworm. Check with:
   ```bash
   cat /etc/os-release
   # Should show VERSION_CODENAME=bullseye
   ```
   If it shows `bookworm`, re-flash with the correct image.
2. **Wrong or missing overlay.** Verify the overlay line in `/boot/config.txt`:
   ```bash
   grep hyperpixel /boot/config.txt
   ```
   It must read exactly: `dtoverlay=vc4-kms-dpi-hyperpixel4sq`
3. **Conflicting display settings.** Remove or comment out any other `dtoverlay` lines related to displays or DPI in `config.txt`.
4. **Header contact issue.** Remove the HyperPixel and inspect the GPIO header pins for bends or debris. Reseat firmly.

### Display works but touch does not respond

1. The HyperPixel 4.0 Square touch uses I2C. Verify I2C is enabled:
   ```bash
   sudo raspi-config nonint do_i2c 0
   sudo reboot
   ```
2. Check for the touch device:
   ```bash
   dmesg | grep -i touch
   ls /dev/input/event*
   ```
3. If I2C conflicts exist with PiSugar (both use I2C), ensure the PiSugar software is configured to share the bus. The PiSugar 3 uses I2C address 0x57/0x68; the HyperPixel touch uses a different address, so they should coexist.

### Wi-Fi will not connect

1. The HyperPixel uses all GPIO pins including some that overlap with the Pi Zero 2 W's secondary functions. However, Wi-Fi on the Zero 2 W uses the on-board wireless module (not GPIO), so there should be no conflict.
2. Verify Wi-Fi credentials were set correctly during imaging. Check `/etc/wpa_supplicant/wpa_supplicant.conf`.
3. Verify the Wi-Fi region is set:
   ```bash
   sudo raspi-config nonint do_wifi_country US
   ```
4. If Wi-Fi was working and then stopped after attaching the HyperPixel, check for physical damage to the Pi's antenna area (the small chip antenna at one end of the Zero 2 W). The HyperPixel board should not touch or press against the antenna.

### PiSugar 3 not powering the Pi

1. Verify pogo pin alignment. The PiSugar pogo pins must press firmly against the Pi Zero 2 W underside test pads. Loosen and retighten the mounting screws to adjust alignment.
2. Check PiSugar battery charge level (LED indicator on PiSugar board).
3. Try powering the Pi directly via its micro-USB port to confirm the Pi itself works.
4. Ensure the PiSugar power switch is in the ON position (some PiSugar 3 units have a physical slide switch).

### System is slow or unresponsive

1. The Pi Zero 2 W has only **512 MB RAM**. Check memory usage:
   ```bash
   free -h
   ```
2. If memory is exhausted, add swap (though this wears the SD card):
   ```bash
   sudo dphys-swapfile swapoff
   sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=256/' /etc/dphys-swapfile
   sudo dphys-swapfile setup
   sudo dphys-swapfile swapon
   ```
3. Review running processes and kill unnecessary services:
   ```bash
   htop
   ```
4. Ensure you are using the **Lite** image, not the Desktop image. The desktop environment consumes ~150--200 MB of the 512 MB.

### microSD card corruption

1. Use a high-quality A1 or A2 rated card from a reputable brand.
2. Never power off the unit without a proper shutdown:
   ```bash
   sudo shutdown -h now
   ```
3. The PiSugar 3 supports safe shutdown triggers. Configure it to send a shutdown signal before battery depletion:
   ```bash
   # Via PiSugar web interface at http://<hostname>:8421
   # Set battery threshold for auto-shutdown (e.g., 10%)
   ```

---

## Assembly Checklist

Use this checklist to verify the build is complete:

- [ ] microSD flashed with Raspberry Pi OS Legacy Lite (Bullseye 32-bit)
- [ ] `dtoverlay=vc4-kms-dpi-hyperpixel4sq` added to `config.txt` on boot partition
- [ ] Wi-Fi and SSH pre-configured via Raspberry Pi Imager
- [ ] PiSugar 3 mounted underneath Pi Zero 2 W with 4x M2.5 screws
- [ ] Pogo pins verified aligned with Pi test pads
- [ ] 40-pin GPIO header present on Pi Zero 2 W (soldered if necessary)
- [ ] HyperPixel 4.0 Square pressed firmly onto GPIO header
- [ ] microSD inserted into Pi Zero 2 W
- [ ] PiSugar 3 charged (or charging via USB-C)
- [ ] First boot successful -- display shows output
- [ ] SSH access verified over Wi-Fi
- [ ] Touch input verified
- [ ] PiSugar battery status verified
