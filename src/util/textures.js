// Small runtime-generated textures (no extra art files needed).
export function makeRuntimeTextures(scene) {
  const t = scene.textures;

  // 4-point sparkle for the bullseye star-burst.
  if (!t.exists('spark')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    const pts = [
      [16, 0], [20, 12], [32, 16], [20, 20],
      [16, 32], [12, 20], [0, 16], [12, 12],
    ];
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillPath();
    g.generateTexture('spark', 32, 32);
    g.destroy();
  }

  // Plain dot, currently spare — handy for future particle work.
  if (!t.exists('dot')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    g.destroy();
  }

  // Mouse-pointer arrow for the tutorial screen (white fill, bold ink outline).
  if (!t.exists('cursor')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.lineStyle(3, 0x26313a, 1);
    g.beginPath();
    g.moveTo(5, 4);
    g.lineTo(5, 37);
    g.lineTo(15, 29);
    g.lineTo(21, 44);
    g.lineTo(27, 41);
    g.lineTo(21, 27);
    g.lineTo(33, 27);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.generateTexture('cursor', 40, 48);
    g.destroy();
  }
}
