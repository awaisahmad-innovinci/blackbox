/** ESC/POS cash drawer kick (ESC p m t1 t2). */
export function buildDrawerKickBuffer(drawerPin: 2 | 5): Buffer {
  return Buffer.from([
    0x1b,
    0x70,
    drawerPin === 2 ? 0x00 : 0x01,
    0x19,
    0xfa,
  ]);
}
