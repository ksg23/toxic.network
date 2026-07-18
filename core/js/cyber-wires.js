(() => {
  const canvas = document.getElementById("cyber-wires");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const nodes = [];
  const mouse = { x: null, y: null, active: false };

  const CONFIG = {
    density: 14000,
    maxNodes: 90,
    minNodes: 35,
    connectionDistance: 160,
    mouseDistance: 200,
    speed: 0.35,
    nodeRadius: 1.6,
    lineColor: [138, 43, 226],
    nodeColor: [0, 180, 255],
    pulseColor: [180, 100, 255],
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let animationId = null;
  let lastTime = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildNodes();
  }

  function nodeCount() {
    return Math.max(
      CONFIG.minNodes,
      Math.min(CONFIG.maxNodes, Math.floor((width * height) / CONFIG.density))
    );
  }

  function createNode() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * CONFIG.speed,
      vy: (Math.random() - 0.5) * CONFIG.speed,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function rebuildNodes() {
    const target = nodeCount();
    while (nodes.length < target) nodes.push(createNode());
    while (nodes.length > target) nodes.pop();
  }

  function update(dt) {
    const clamp = Math.min(dt, 32) / 16.67;

    for (const node of nodes) {
      node.x += node.vx * clamp;
      node.y += node.vy * clamp;
      node.pulse += 0.03 * clamp;

      if (node.x < -20) node.x = width + 20;
      if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      if (node.y > height + 20) node.y = -20;

      if (mouse.active) {
        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < CONFIG.mouseDistance && dist > 1) {
          node.vx += (dx / dist) * 0.012 * clamp;
          node.vy += (dy / dist) * 0.012 * clamp;
        }
      }

      const maxSpeed = CONFIG.speed * 2.2;
      const speed = Math.hypot(node.vx, node.vy);
      if (speed > maxSpeed) {
        node.vx = (node.vx / speed) * maxSpeed;
        node.vy = (node.vy / speed) * maxSpeed;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    const [lr, lg, lb] = CONFIG.lineColor;
    const [nr, ng, nb] = CONFIG.nodeColor;
    const [pr, pg, pb] = CONFIG.pulseColor;
    const maxDist = CONFIG.connectionDistance;
    const maxDistSq = maxDist * maxDist;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > maxDistSq) continue;

        const dist = Math.sqrt(distSq);
        const alpha = (1 - dist / maxDist) * 0.45;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (mouse.active) {
        const mdx = a.x - mouse.x;
        const mdy = a.y - mouse.y;
        const mdist = Math.hypot(mdx, mdy);
        if (mdist < CONFIG.mouseDistance) {
          const alpha = (1 - mdist / CONFIG.mouseDistance) * 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    for (const node of nodes) {
      const glow = 0.55 + Math.sin(node.pulse) * 0.25;
      ctx.beginPath();
      ctx.arc(node.x, node.y, CONFIG.nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${nr}, ${ng}, ${nb}, ${glow})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, CONFIG.nodeRadius * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${nr}, ${ng}, ${nb}, ${glow * 0.12})`;
      ctx.fill();
    }
  }

  function frame(time) {
    const dt = lastTime ? time - lastTime : 16;
    lastTime = time;
    update(dt);
    draw();
    animationId = requestAnimationFrame(frame);
  }

  function onPointerMove(event) {
    const point = event.touches ? event.touches[0] : event;
    mouse.x = point.clientX;
    mouse.y = point.clientY;
    mouse.active = true;
  }

  function onPointerLeave() {
    mouse.active = false;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", onPointerMove, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: true });
  window.addEventListener("mouseleave", onPointerLeave);
  window.addEventListener("touchend", onPointerLeave);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(animationId);
      animationId = null;
      lastTime = 0;
    } else if (!animationId) {
      animationId = requestAnimationFrame(frame);
    }
  });

  resize();
  animationId = requestAnimationFrame(frame);
})();
