'use client'; // Required for client-side interactivity (hooks, event handlers)

import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Constants ---
const TARGET_WORD = "STUDENTHUB";
const INITIAL_SPEED = 0.8; // Initial speed of balloons (pixels per frame)
const SPEED_INCREMENT = 0.15; // How much speed increases each round
const BALLOON_RADIUS_X = 30; // Base horizontal radius (widest part)
const BALLOON_RADIUS_Y = 38; // Base vertical radius (from center to top/bottom of main body)
const FONT_SIZE = 20; // Font size for letters inside balloons
const SPAWN_INTERVAL = 1200; // Milliseconds between balloon spawns (decreases with speed)
const MAX_BALLOONS = 50; // Maximum number of balloons on screen at once (Increased further)
const WRONG_MESSAGE = "Wrong! Try Again";
const SUCCESS_MESSAGE = "STUDENTHUB!";

// --- Unique Letters for Fair Random Spawn ---
const UNIQUE_TARGET_LETTERS = Array.from(new Set(TARGET_WORD.split(''))).join(''); // "STUDENHB"

// --- Cloud Type Definition ---
interface Cloud {
    id: number;
    x: number;
    y: number;
    radiusX: number;
    radiusY: number;
    dx: number; // Horizontal speed
    alpha: number; // Opacity
    prerenderedCanvas: HTMLCanvasElement | null; // For optimization
}

// --- Balloon Type Definition ---
interface Balloon {
  id: number; // Unique identifier for React keys and logic
  x: number; // Horizontal position (center)
  y: number; // Vertical position (center of the oval part)
  letter: string; // The letter inside the balloon
  radiusX: number; // Horizontal radius for drawing and collision detection
  radiusY: number; // Vertical radius for drawing and collision detection
  dy: number; // Vertical speed (pixels per frame)
  color: string; // Background color of the balloon
  popped: boolean; // Flag to indicate if the balloon has been popped
}

// --- Helper Function: Get Random Color ---
const getRandomColor = () => {
  // Palette of soft, colorful tones
  const colors = [
    '#FFADAD', // Light Pink/Red
    '#FFD6A5', // Light Orange
    '#FDFFB6', // Light Yellow
    '#CAFFBF', // Light Green
    '#9BF6FF', // Light Cyan
    '#A0C4FF', // Light Blue
    '#BDB2FF', // Light Purple
    '#FFC6FF', // Light Magenta
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// --- Add Helper Function: Lighten Color (Basic) ---
// (Place this outside the component, e.g., after imports)
const lightenColor = (hex: string, percent: number): string => {
    hex = hex.replace(/^#/, '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const amount = Math.round(2.55 * percent * 100);

    const newR = Math.min(255, r + amount);
    const newG = Math.min(255, g + amount);
    const newB = Math.min(255, b + amount);

    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

// --- React Component ---
const BalloonPopGame: React.FC = () => {
  // --- State Variables ---
  const canvasRef = useRef<HTMLCanvasElement>(null); // Ref to access the canvas element
  const [score, setScore] = useState(0); // Player's current score
  const [currentIndex, setCurrentIndex] = useState(0); // Index of the next letter to pop in TARGET_WORD
  const [balloons, setBalloons] = useState<Balloon[]>([]); // Array holding active balloon objects
  const [gameSpeed, setGameSpeed] = useState(INITIAL_SPEED); // Current speed multiplier for balloons
  const [message, setMessage] = useState<string | null>(null); // Message displayed on screen (e.g., "Wrong!", "Nice!")
  const [messageColor, setMessageColor] = useState<string>('red'); // Color for the message
  const [clouds, setClouds] = useState<Cloud[]>([]); // Array holding cloud objects
  const [gameState, setGameState] = useState<'intro' | 'playing'>('intro'); // Track intro vs game screen

  // --- Refs for Game Logic State (to avoid stale closures in game loop) ---
  const scoreRef = useRef(score);
  const currentIndexRef = useRef(currentIndex);
  const balloonsRef = useRef(balloons);
  const gameSpeedRef = useRef(gameSpeed);
  const messageRef = useRef(message);
  const messageColorRef = useRef(messageColor);
  const cloudsRef = useRef(clouds);

  // --- Refs for Timers and Animation Frame ---
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref to manage the message display timer
  const animationFrameRef = useRef<number | null>(null); // Ref to manage the requestAnimationFrame loop
  const lastSpawnTimeRef = useRef<number>(0); // Ref to track the time of the last balloon spawn

  // --- Effect to keep refs updated with latest state ---
  useEffect(() => {
    scoreRef.current = score;
    currentIndexRef.current = currentIndex;
    balloonsRef.current = balloons;
    gameSpeedRef.current = gameSpeed;
    messageRef.current = message;
    messageColorRef.current = messageColor;
    cloudsRef.current = clouds;
  }, [score, currentIndex, balloons, gameSpeed, message, messageColor, clouds]);

  // --- Function: Show Temporary Message ---
  const showMessage = (msg: string, color: string = 'red', duration: number = 1500) => {
    setMessage(msg);
    setMessageColor(color);
    // Clear previous timeout if exists
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    // Set new timeout to clear the message
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(null);
    }, duration);
  };

  // --- Function: Reset Game ---
  // useCallback ensures this function reference is stable unless dependencies change
  const resetGame = useCallback((keepScore = false) => {
    console.log("Resetting game state... Setting currentIndex to 0."); // Log reset
    setCurrentIndex(0); // Reset target letter index
    setBalloons([]); // Clear all balloons
    setGameSpeed(INITIAL_SPEED); // Reset speed
    if (!keepScore) {
        setScore(0); // Reset score unless specified otherwise
    }
    setMessage(null); // Clear any active message
    lastSpawnTimeRef.current = performance.now(); // Reset spawn timer immediately

    // Ensure the animation loop restarts cleanly after reset
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    // Use a slight delay before restarting the loop to ensure state updates are processed
    setTimeout(() => {
        console.log("Restarting animation loop after reset.");
        animationFrameRef.current = requestAnimationFrame(gameLoop);
    }, 50); // Short delay (e.g., 50ms)

  }, []); // No dependencies needed as it uses setters and initial constants


  // --- Function: Initialize Clouds ---
  const initializeClouds = useCallback((canvasWidth: number, canvasHeight: number) => {
    const numClouds = 5; // Number of clouds
    const newClouds: Cloud[] = [];
    for (let i = 0; i < numClouds; i++) {
        const rX = Math.random() * 40 + 50; // Random horizontal radius (50-90)
        const rY = rX * (Math.random() * 0.3 + 0.5); // Vertical radius based on horizontal (flatter)
        const cloudAlpha = Math.random() * 0.3 + 0.6; // Opacity (0.6 - 0.9)
        const cloudDx = (Math.random() * 0.3 + 0.1) * (Math.random() < 0.5 ? 1 : -1); // Slow horizontal drift speed (left or right)

        // Pre-render the cloud onto a hidden canvas
        const cloudCanvas = document.createElement('canvas');
        const padding = 10; // Padding around the cloud drawing
        cloudCanvas.width = rX * 2 + padding * 2;
        cloudCanvas.height = rY * 2 + padding * 2;
        const cloudCtx = cloudCanvas.getContext('2d');

        if (cloudCtx) {
             // Draw a nicer cloud shape onto the hidden canvas
             const centerX = cloudCanvas.width / 2;
             const centerY = cloudCanvas.height / 2;

             // Use multiple radial gradients for a fluffy effect - Simplified & Increased Alpha
             const puffs = [
                // Increased alpha values further
                { offsetX: 0, offsetY: 0, radiusX: rX, radiusY: rY, alpha: 0.7 },
                { offsetX: rX * 0.4, offsetY: rY * 0.1, radiusX: rX * 0.7, radiusY: rY * 0.8, alpha: 0.5 },
                { offsetX: -rX * 0.3, offsetY: rY * 0.2, radiusX: rX * 0.6, radiusY: rY * 0.7, alpha: 0.6 },
             ];

             puffs.forEach(puff => {
                 const gradX = centerX + puff.offsetX;
                 const gradY = centerY + puff.offsetY;
                 const gradient = cloudCtx.createRadialGradient(
                     gradX, gradY, 0, // Inner circle (center)
                     gradX, gradY, Math.max(puff.radiusX, puff.radiusY) // Outer circle
                 );
                 gradient.addColorStop(0, `rgba(255, 255, 255, ${puff.alpha})`); // Inner color (more opaque)
                 gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);      // Outer color (transparent)

                 cloudCtx.fillStyle = gradient;
                 cloudCtx.beginPath();
                 cloudCtx.ellipse(gradX, gradY, puff.radiusX, puff.radiusY, 0, 0, Math.PI * 2);
                 cloudCtx.fill();
             });
        } else {
            console.error("Failed to get context for offscreen cloud canvas");
        }

        newClouds.push({
            id: i,
            x: Math.random() * (canvasWidth + rX * 4) - rX * 2, // Start positions potentially off-screen
            y: Math.random() * canvasHeight * 0.6 + canvasHeight * 0.1, // Place in upper 60% of sky
            radiusX: rX,
            radiusY: rY,
            dx: cloudDx,
            alpha: cloudAlpha,
            prerenderedCanvas: cloudCanvas, // Store the canvas
        });
    }
    setClouds(newClouds);
  }, []); // Empty dependency array means this runs once on mount effectively (via useEffect)


  // --- Function: Spawn Balloon ---
  // useCallback ensures this function reference is stable unless dependencies change
  // Now reads needed state from refs
  const spawnBalloon = useCallback((canvasWidth: number, canvasHeight: number) => {
      const nextLetterNeeded = TARGET_WORD[currentIndexRef.current]; // Use ref
      console.log(`spawnBalloon: CurrentIndexRef = ${currentIndexRef.current}, Need: ${nextLetterNeeded}`);
      let letterToSpawn = '';

      // Check if the needed letter is already on screen (and not popped)
      // Use the passed currentBalloons array, still needed here as setBalloons is async
      const isNeededLetterOnScreen = balloonsRef.current.some(b => !b.popped && b.letter === nextLetterNeeded); // Use ref

      if (!isNeededLetterOnScreen) {
          // If needed letter is NOT on screen, ALWAYS spawn it.
          letterToSpawn = nextLetterNeeded;
      } else {
          // If needed letter IS on screen, spawn a random unique letter from the word.
          // Ensure the random letter isn't the one we just popped (if applicable) - less important now
          letterToSpawn = UNIQUE_TARGET_LETTERS[Math.floor(Math.random() * UNIQUE_TARGET_LETTERS.length)];
          // Optional: Add logic here to re-roll if it randomly picks nextLetterNeeded again, though less critical now.
      }

      // Create the new balloon object
      const radiusX = BALLOON_RADIUS_X + (Math.random() * 8 - 4); // Slight size variation
      const radiusY = BALLOON_RADIUS_Y + (Math.random() * 10 - 5); // Slight size variation
      const newBalloon: Balloon = {
        id: Date.now() + Math.random(), // Simple unique ID
        x: Math.random() * (canvasWidth - radiusX * 2) + radiusX, // Random horizontal position
        y: canvasHeight + radiusY * 2, // Start below the screen (using vertical radius)
        letter: letterToSpawn,
        radiusX: radiusX,
        radiusY: radiusY,
        dy: gameSpeedRef.current + Math.random() * 0.3, // Use ref
        color: getRandomColor(),
        popped: false,
      };
      // Add the new balloon to the state
      setBalloons(prev => [...prev, newBalloon]);
      lastSpawnTimeRef.current = performance.now(); // Update last spawn time
  }, []); // No dependencies needed now as it reads refs and calls setters


  // --- Core Game Loop Function ---
  // useCallback ensures this function reference is stable
  // Reads state from refs
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    // Ensure canvas and context are available
    if (!canvas || !ctx) {
      console.error("Canvas or context not found, skipping frame.");
      // Request next frame even if context is lost temporarily
      animationFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // --- Canvas Resizing and DPI Scaling ---
    const dpr = window.devicePixelRatio || 1; // Get device pixel ratio
    const rect = canvas.getBoundingClientRect(); // Get canvas size in CSS pixels

    // Resize canvas drawing buffer if needed
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        console.log("Resizing canvas:", rect.width, rect.height, "DPR:", dpr);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.scale(dpr, dpr); // Scale context to match DPI
    }
    // Use logical width/height for drawing calculations
    const logicalWidth = rect.width;
    const logicalHeight = rect.height;
    // --- End Resize ---

    // Clear canvas with background color
    // Soft gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, logicalHeight);
    gradient.addColorStop(0, '#a1c4fd'); // Light Blue at the top
    gradient.addColorStop(1, '#c2e9fb'); // Lighter Blue/Cyan at the bottom
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // --- Draw Clouds ---
    // Draw pre-rendered clouds using drawImage for performance
    cloudsRef.current.forEach(cloud => { // Use ref
        if (cloud.prerenderedCanvas) {
            ctx.globalAlpha = cloud.alpha; // Apply overall cloud opacity
            ctx.drawImage(
                cloud.prerenderedCanvas,
                cloud.x - cloud.prerenderedCanvas.width / 2, // Position based on center
                cloud.y - cloud.prerenderedCanvas.height / 2
            );

            // Update cloud position
            cloud.x += cloud.dx;

            // Wrap cloud around screen
            const screenWidthWithPadding = logicalWidth + cloud.prerenderedCanvas.width;
            if (cloud.dx > 0 && cloud.x - cloud.prerenderedCanvas.width / 2 > logicalWidth) {
                cloud.x = -cloud.prerenderedCanvas.width / 2; // Reset to left
            } else if (cloud.dx < 0 && cloud.x + cloud.prerenderedCanvas.width / 2 < 0) {
                cloud.x = logicalWidth + cloud.prerenderedCanvas.width / 2; // Reset to right
            }
        } // else: Handle case where canvas wasn't created? (Shouldn't happen here)
    });
    ctx.globalAlpha = 1.0; // Reset global alpha

    const now = performance.now();

    // --- Spawn New Balloons ---
    // Calculate dynamic spawn interval based on game speed
    const currentSpawnInterval = SPAWN_INTERVAL / (gameSpeedRef.current / INITIAL_SPEED); // Use ref
    if (now - lastSpawnTimeRef.current > currentSpawnInterval && balloonsRef.current.length < MAX_BALLOONS) { // Use ref
         // Pass the current balloons state as an argument - spawnBalloon itself reads refs now
         spawnBalloon(logicalWidth, logicalHeight);
    }

    // --- Update and Draw Balloons ---
    let activeBalloons: Balloon[] = []; // Store balloons that are still active
    balloonsRef.current.forEach(balloon => { // Use ref
      if (balloon.popped) return; // Skip already popped balloons

      // Update position (move upwards)
      balloon.y -= balloon.dy;

      // --- Draw Balloon ---
      ctx.save(); // Save context state before drawing balloon
      ctx.translate(balloon.x, balloon.y); // Translate to balloon center for easier drawing

      const width = balloon.radiusX * 2;
      const height = balloon.radiusY * 2;
      const knotSize = 8; // Size of the knot
      const bodyHeight = height * 0.9; // Main body part height
      const neckHeight = height * 0.1; // Small neck before the knot

      // --- 3D Effect: Radial Gradient for Highlight ---
      // Offset the highlight gradient slightly towards top-left
      const highlightX = -width * 0.2;
      const highlightY = -height * 0.3;
      const gradient = ctx.createRadialGradient(
        highlightX, highlightY, 0, // Inner circle (start) - small radius at highlight pos
        0, 0, width * 0.7 // Outer circle (end) - larger radius centered
      );

      // Add color stops: Lighter color -> base color
      // Create a slightly lighter version of the balloon color for the highlight
      // Basic lighten: Add white (could use a proper color library for better results)
      const lighterColor = lightenColor(balloon.color, 0.3); // Use a helper function (add below)
      gradient.addColorStop(0, lighterColor);
      gradient.addColorStop(1, balloon.color);

      // Balloon Body using Quadratic Curves
      ctx.beginPath();
      ctx.moveTo(0, -bodyHeight / 2); // Start at top center
      // Left side curve (control point pulls outward and downward)
      ctx.quadraticCurveTo(-width * 0.7, -bodyHeight * 0.3, -width * 0.1, bodyHeight / 2 - neckHeight);
      // Neck taper in
      ctx.lineTo(0, bodyHeight / 2); // To center bottom of main body
      // Right side curve (control point pulls outward and downward)
      ctx.quadraticCurveTo(width * 0.7, -bodyHeight * 0.3, 0, -bodyHeight / 2);
      // Uncomment this and comment above two quadratic curves for a simpler oval if needed
      // ctx.ellipse(0, 0, balloon.radiusX, balloon.radiusY, 0, 0, Math.PI * 2);

      // Fill with gradient instead of solid color
      ctx.fillStyle = gradient; // Apply the gradient
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'; // Slightly darker shadow
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      ctx.fill();

      // Draw the knot (small triangle at the bottom)
      const knotY = bodyHeight / 2; // Position at the bottom center of the body
      ctx.beginPath();
      ctx.moveTo(-knotSize / 2, knotY); // Left corner
      ctx.lineTo(knotSize / 2, knotY); // Right corner
      ctx.lineTo(0, knotY + knotSize);   // Bottom point
      ctx.closePath();
      ctx.fillStyle = balloon.color; // Same color as balloon
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)'; // Lighter shadow for knot
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 1;
      ctx.fill();

      // Reset shadow for other elements
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Optional: Add a light border to the main body
      ctx.beginPath();
       ctx.moveTo(0, -bodyHeight / 2); // Start at top center
      ctx.quadraticCurveTo(-width * 0.7, -bodyHeight * 0.3, -width * 0.1, bodyHeight / 2 - neckHeight);
      ctx.lineTo(0, bodyHeight / 2);
      ctx.quadraticCurveTo(width * 0.7, -bodyHeight * 0.3, 0, -bodyHeight / 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Don't closePath() here if we didn't draw the full outline

      // --- Draw Letter (Adjust position slightly if needed due to shape) ---
      ctx.fillStyle = 'white'; // Bold white letter
      ctx.font = `bold ${FONT_SIZE}px "Inter", sans-serif`; // Use Inter font
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Add text shadow for better readability
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      // Draw letter slightly above center vertically due to shape
      ctx.fillText(balloon.letter, 0, -height * 0.1);
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      ctx.restore(); // Restore context state (undo translation)


      // Keep balloon if it's still visible on screen (or slightly above)
      // Adjust check based on vertical radius and knot
      if (balloon.y + balloon.radiusY > -30) { // Keep if bottom of oval is above screen edge
        activeBalloons.push(balloon);
      } else {
          // Optional: If a needed letter floats away, maybe penalize or reset?
          // For now, just let it go.
      }
    });
    // Update the state with only the active balloons
    // Optimization: Only update state if the array content actually changed
    if (activeBalloons.length !== balloonsRef.current.length || !activeBalloons.every((b, i) => b.id === balloonsRef.current[i]?.id)) { // Use ref
       setBalloons(activeBalloons);
    }


    // --- Draw Score ---
    const scoreText = `Score: ${scoreRef.current}`; // Use ref
    ctx.font = 'bold 18px "Inter", sans-serif';
    const scoreMetrics = ctx.measureText(scoreText);
    const scorePadding = 8;
    const scoreBoxWidth = scoreMetrics.width + scorePadding * 2;
    const scoreBoxHeight = 18 + scorePadding * 2; // Approx height based on font size
    const scoreX = 15;
    const scoreY = 15;

    // Draw score background box
    ctx.fillStyle = 'rgba(0, 77, 64, 0.8)'; // Dark Teal with some transparency
    ctx.beginPath();
    ctx.roundRect(scoreX - scorePadding, scoreY - scorePadding, scoreBoxWidth, scoreBoxHeight, 8); // Rounded corners
    ctx.fill();

    // Draw score text
    ctx.fillStyle = '#FFFFFF'; // White text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(scoreText, scoreX, scoreY);

    // --- Draw Target Word Progress ---
     const targetDisplay = TARGET_WORD.split('').map((char, index) => index < currentIndexRef.current ? char : '_').join(' '); // Use ref
     const targetText = `Target: ${targetDisplay}`;
     ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
     ctx.font = '16px "Inter", sans-serif';
     ctx.textAlign = 'right'; // Align to the right
     ctx.textBaseline = 'top';
     // Position near the top right, with padding
     ctx.fillText(targetText, logicalWidth - 15, 15 + (scoreBoxHeight - 16)/2); // Align vertically with score center

    // --- Draw On-Screen Message ---
    if (messageRef.current) { // Use ref
      ctx.fillStyle = messageColorRef.current; // Use ref
      ctx.font = 'bold 36px "Inter", sans-serif'; // Larger font for messages
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 5;
      ctx.fillText(messageRef.current, logicalWidth / 2, logicalHeight / 2); // Use ref
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // Request the next frame for smooth animation
    animationFrameRef.current = requestAnimationFrame(gameLoop);

  }, [setBalloons]); // Minimal dependencies: only stable setters needed for updates within the loop itself


  // --- Effect Hook: Initialize Clouds ONCE ---
  useEffect(() => {
      console.log("Component mounted. Initializing clouds...");
      const canvas = canvasRef.current;
      if (canvas) {
          // Get initial dimensions even if 0, gameLoop will resize later
          const rect = canvas.getBoundingClientRect();
          initializeClouds(rect.width, rect.height);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs ONLY ONCE on mount


  // --- Effect Hook: Manage Game Loop (Only Run When Playing) ---
  useEffect(() => {
    // Only start the game loop if we are in the 'playing' state
    if (gameState === 'playing') {
        console.log("Game state is 'playing'. Starting game loop.");
        animationFrameRef.current = requestAnimationFrame(gameLoop);
    } else {
        console.log("Game state is not 'playing'. Game loop paused.");
        // Ensure any existing loop is cancelled if state changes away from 'playing'
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }

    // Cleanup function: runs when the component unmounts OR dependencies change
    return () => {
      console.log("Game loop effect cleaning up.");
      // Cancel the animation frame to prevent memory leaks
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Clear any pending message timeouts
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  // Now depends on gameLoop and gameState
  }, [gameLoop, gameState]);


   // --- Event Handler: Canvas Click/Tap ---
   // useCallback ensures this function reference is stable unless dependencies change
   // Reads some state from refs, uses setters
  const handleCanvasInteraction = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    // Don't process clicks if a message is showing (prevents accidental double-clicks during reset)
    if (!canvas || messageRef.current) return; // Use ref

    const rect = canvas.getBoundingClientRect();

    // Determine click/touch coordinates relative to the canvas
    let clientX, clientY;
    if ('touches' in event) { // Check if it's a touch event
        if (event.touches.length === 0) return; // No touch points
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else { // Mouse event
        clientX = event.clientX;
        clientY = event.clientY;
    }

    // Adjust coordinates for canvas scaling (DPR) and position on page
    // We calculate logical coordinates for collision detection
    const scaleX = canvas.width / (rect.width * (window.devicePixelRatio || 1));
    const scaleY = canvas.height / (rect.height * (window.devicePixelRatio || 1));
    const x = (clientX - rect.left); // Logical X relative to canvas element
    const y = (clientY - rect.top);  // Logical Y relative to canvas element


    // Check balloons in reverse order (topmost first) for hit detection
    // Read directly from state here, as ref might not be updated yet within the same event handler tick
    for (let i = balloons.length - 1; i >= 0; i--) {
      const balloon = balloons[i];
      if (balloon.popped) continue; // Skip already popped

      // Simple ellipse collision detection (approximation)
      // Treat interaction point as a point and check if it's inside the ellipse equation:
      // ( (x - h)^2 / a^2 ) + ( (y - k)^2 / b^2 ) <= 1
      // where (h,k) is center (balloon.x, balloon.y), a is radiusX, b is radiusY
      const termX = ((x - balloon.x) ** 2) / (balloon.radiusX ** 2);
      const termY = ((y - balloon.y) ** 2) / (balloon.radiusY ** 2);
      const isInsideEllipse = (termX + termY) <= 1;

      // Also check the small knot area roughly
      const knotSize = 8;
      const knotY = balloon.y + balloon.radiusY -2;
      const isInKnot = (x >= balloon.x - knotSize / 2 && x <= balloon.x + knotSize / 2 && y >= knotY && y <= knotY + knotSize);


      if (isInsideEllipse || isInKnot) { // Hit if inside oval OR inside knot
        // --- Balloon Hit! ---
        // Use ref for currentIndex check, as it reflects the *intended* state for the *next* action
        if (balloon.letter === TARGET_WORD[currentIndexRef.current]) {
          // --- Correct Letter ---
          // balloon.popped = true; // Mark as popped (will be filtered out later)
          // Don't mutate directly, update via setBalloons
          const pointsEarned = 10 + Math.floor(gameSpeedRef.current * 5); // Use ref
          console.log(`handleInteraction: Correct pop! Letter: ${balloon.letter}, CurrentIndex before update: ${currentIndexRef.current}`); // Use ref
          setScore(prev => prev + pointsEarned);
          const nextIndex = currentIndexRef.current + 1; // Use ref

          // Check if word is completed
          if (nextIndex === TARGET_WORD.length) {
            // --- Word Completed ---
            showMessage(SUCCESS_MESSAGE, 'green', 2000); // Show success message longer
            setGameSpeed(prev => prev + SPEED_INCREMENT); // Increase speed
            setCurrentIndex(0); // Reset index for the next word
             // Clear remaining balloons for the new round (visually cleaner)
             setBalloons(prev => prev.filter(b => b.id === balloon.id)); // Keep only the just-popped one briefly? Or clear all?
             // Let's clear all non-popped balloons immediately for a fresh start
             setBalloons([]);
             lastSpawnTimeRef.current = performance.now(); // Ensure spawning starts quickly for new round
          } else {
            // --- Move to Next Letter ---
            setCurrentIndex(nextIndex);
            console.log(`handleInteraction: Set CurrentIndex to ${nextIndex}`); // Log after update
             // Update state immediately to reflect the pop visually before the next frame
             // Filter based on the hit balloon's ID
             setBalloons(prev => prev.filter(b => b.id !== balloon.id));
          }
        } else {
          // --- Wrong Letter ---
          console.log(`handleInteraction: Wrong pop! Letter: ${balloon.letter}, Expected: ${TARGET_WORD[currentIndexRef.current]}`); // Use ref
          showMessage(WRONG_MESSAGE, 'red', 1500);
          // Reset the game as per requirement (including score)
          resetGame(false);
        }
        // Important: break after processing the first (topmost) balloon hit
        break;
      }
    }
  }, [balloons, resetGame, showMessage]); // Dependencies: Include state read directly (balloons) and stable functions called


  // --- Effect Hook: Resize Listener ---
  useEffect(() => {
      const handleResize = () => {
          // No need to explicitly redraw here, the gameLoop handles resizing internally
          // This just ensures the loop runs immediately after resize if paused
          console.log("Window resized");
          if (animationFrameRef.current) {
             // Cancel and request immediately to potentially adjust layout faster
             // cancelAnimationFrame(animationFrameRef.current);
             // animationFrameRef.current = requestAnimationFrame(gameLoop);
             // Or just let the loop handle it on the next frame
          }
      };
      window.addEventListener('resize', handleResize);
      // Cleanup listener on unmount
      return () => window.removeEventListener('resize', handleResize);
  }, []); // No dependency on gameLoop needed here

  // --- JSX Rendering ---
  return (
    // Main container: Full screen, flex column, centered items
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-100 to-blue-200 p-4 font-sans">
       {/* Game Title */}
       <h1 className="text-3xl md:text-4xl font-bold mb-4 text-blue-800 shadow-sm">
         StudentHub Balloon Pop
       </h1>

       {gameState === 'intro' && (
         <div className="flex flex-col items-center text-center p-8 bg-white rounded-2xl shadow-xl max-w-md border border-gray-200">
           <h2 className="text-3xl font-bold mb-6 text-blue-800">How to Play</h2>
           <p className="mb-4 text-lg text-gray-600">
             Click or tap the balloons in the correct order to spell the word:
           </p>
           {/* Enhanced Target Word Styling */}
           <p className="mb-6 text-5xl font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
             {TARGET_WORD}
           </p>
           <p className="mb-8 text-lg text-gray-600">
             Popping the wrong balloon resets the game. Good luck!
           </p>
           {/* Enhanced Button Styling */}
           <button
             onClick={() => {
               setGameState('playing');
               resetGame(false); // Ensure game starts fresh when Play is clicked
             }}
             className="px-10 py-4 bg-gradient-to-r from-green-400 to-blue-500 text-white text-xl font-bold rounded-full shadow-lg hover:from-green-500 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 focus:ring-opacity-75 transition duration-150 ease-in-out transform hover:scale-110"
           >
             Play Game
           </button>
         </div>
       )}

       {gameState === 'playing' && (
         <>
           {/* Canvas Container: Max width, aspect ratio for mobile-like view, rounded corners, shadow */}
           <div className="w-full max-w-md aspect-[9/16] rounded-lg shadow-xl overflow-hidden border-2 border-gray-300">
                <canvas
                    ref={canvasRef}
                    // Use both mouse and touch events for broader compatibility
                    onClick={handleCanvasInteraction}
                    onTouchStart={handleCanvasInteraction}
                    className="block w-full h-full bg-white cursor-pointer" // Ensure canvas fills its container
                    // Set initial logical size - JS will override based on container
                    width={360}
                    height={640}
                ></canvas>
           </div>
          {/* Restart Button */}
          <button
            onClick={() => resetGame(false)} // Reset score on manual restart
            className="mt-6 px-8 py-3 bg-blue-600 text-white text-lg font-semibold rounded-full shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-150 ease-in-out transform hover:scale-105"
          >
            Restart Game
          </button>
         </>
       )}
    </div>
  );
};

export default BalloonPopGame; // Default export for Next.js page
