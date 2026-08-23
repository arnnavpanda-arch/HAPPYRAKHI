/* ============================================================
   CONFIG
   ============================================================ */
// Change this before sharing the site publicly. This is a simple
// client-side gate for a personal gift site — not real security.
const ADMIN_PASSWORD = "sister2026";
const STORAGE_PREFIX = "coupon:";
const SHARED = true; // coupons are shared so any visitor can redeem them

/* ============================================================
   5 SECOND CELEBRATION FIREWORKS
   ============================================================ */
function createCelebration() {
    const celebration = document.getElementById("celebration");
    if(!celebration) return;
    celebration.innerHTML = ''; // Clear any existing particles
    const colors = ["#ff004c", "#ffcc00", "#00ffff", "#00ff66", "#ff00ff", "#ffffff", "#ff6600", "#7c4dff"];

    for (let rocket = 0; rocket < 18; rocket++) {
        const startX = Math.random() * window.innerWidth;
        const targetY = -(window.innerHeight * (0.35 + Math.random() * 0.55));
        const targetX = (Math.random() - 0.5) * window.innerWidth;

        const rocketParticle = document.createElement("div");
        rocketParticle.className = "particle";
        rocketParticle.style.left = startX + "px";
        rocketParticle.style.setProperty("--x", targetX + "px");
        rocketParticle.style.setProperty("--y", targetY + "px");
        rocketParticle.style.setProperty("--delay", (rocket * 0.12) + "s");
        rocketParticle.style.background = colors[Math.floor(Math.random() * colors.length)];
        rocketParticle.style.boxShadow = "0 0 15px " + rocketParticle.style.background;
        celebration.appendChild(rocketParticle);

        for (let spark = 0; spark < 12; spark++) {
            const p = document.createElement("div");
            p.className = "particle";
            const x = (Math.random() - 0.5) * window.innerWidth * 1.5;
            const y = -(Math.random() * window.innerHeight);
            p.style.left = startX + "px";
            p.style.setProperty("--x", x + "px");
            p.style.setProperty("--y", y + "px");
            p.style.setProperty("--delay", (rocket * 0.12 + Math.random() * 0.4) + "s");
            p.style.background = colors[Math.floor(Math.random() * colors.length)];
            p.style.boxShadow = "0 0 15px " + p.style.background;
            celebration.appendChild(p);
        }
    }

    setTimeout(() => {
        celebration.innerHTML = "";
    }, 5500);
}

// Trigger fireworks immediately on page load
createCelebration();

/* ============================================================
   AMBIENT BACKGROUND: petals + diyas
   ============================================================ */
function spawnPetals(){
  const layer = document.getElementById('petals-layer');
  const count = window.innerWidth < 600 ? 14 : 24;
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'petal';
    const left = Math.random()*100;
    const dur = 9 + Math.random()*10;
    const delay = Math.random()*10;
    const drift = (Math.random()*80-40)+'px';
    p.style.left = left+'vw';
    p.style.animationDuration = dur+'s';
    p.style.animationDelay = '-'+delay+'s';
    p.style.setProperty('--drift', drift);
    p.style.transform = `scale(${0.6+Math.random()*0.8})`;
    layer.appendChild(p);
  }
}
function spawnDiyas(){
  const hero = document.getElementById('hero');
  const count = 8;
  for(let i=0;i<count;i++){
    const d = document.createElement('div');
    d.className = 'diya';
    d.style.left = (5 + Math.random()*90)+'%';
    d.style.top = (10 + Math.random()*70)+'%';
    d.style.animationDelay = (Math.random()*2)+'s';
    hero.appendChild(d);
  }
}
spawnPetals();
spawnDiyas();

/* 3D parallax on the thread banner following pointer */
const stage = document.getElementById('threadStage');
document.getElementById('hero').addEventListener('mousemove', (e)=>{
  const r = stage.getBoundingClientRect();
  const cx = r.left + r.width/2;
  const cy = r.top + r.height/2;
  const dx = (e.clientX - cx)/r.width;
  const dy = (e.clientY - cy)/r.height;
  stage.style.transform = `rotateY(${dx*18}deg) rotateX(${-dy*18}deg)`;
});
document.getElementById('hero').addEventListener('mouseleave', ()=>{
  stage.style.transform = '';
});

/* ============================================================
   STORAGE HELPERS (Backend via Fetch)
   ============================================================ */
async function getCoupon(code){
  try{
    const res = await fetch('/api/coupons/' + code);
    if(res.ok){
      const data = await res.json();
      return data.value;
    }
    return null;
  }catch(err){
    console.error(err);
    return null; // key not found
  }
}
async function setCoupon(code, data, audioFile){
  const formData = new FormData();
  formData.append('data', JSON.stringify(data));
  if(audioFile){
    formData.append('audioFile', audioFile);
  }

  const res = await fetch('/api/coupons/' + code, {
    method: 'POST',
    body: formData
  });
  if(!res.ok) throw new Error('Failed to save to backend');
  return true;
}
async function deleteCoupon(code){
  const res = await fetch('/api/coupons/' + code, {
    method: 'DELETE'
  });
  if(!res.ok) throw new Error('Failed to delete');
  return true;
}
async function listCoupons(){
  try{
    const res = await fetch('/api/coupons');
    if(res.ok){
      const data = await res.json();
      return data.keys || [];
    }
    return [];
  }catch(err){
    console.error(err);
    return [];
  }
}


/* ============================================================
   COUPON ENTRY / REVEAL
   ============================================================ */
const couponForm = document.getElementById('coupon-form');
const couponInput = document.getElementById('coupon-input');
const couponError = document.getElementById('coupon-error');
const couponSubmit = document.getElementById('coupon-submit');
const couponSection = document.getElementById('couponSection');
const revealSection = document.getElementById('revealSection');

let currentActiveCode = null; // Track which code is currently being viewed

/* ============================================================
   REAL-TIME SYNC (SSE)
   ============================================================ */
const evtSource = new EventSource('/api/stream');
evtSource.addEventListener('coupon_updated', async (e) => {
    const eventData = JSON.parse(e.data);
    // If the updated code is the one currently being viewed, hot-reload it!
    if (currentActiveCode && eventData.code === currentActiveCode) {
        const newData = await getCoupon(currentActiveCode);
        if (newData) {
            console.log("Hot reloading code:", currentActiveCode);
            showReveal(newData, true); // true = isHotReload
        }
    }
});
evtSource.addEventListener('coupon_deleted', (e) => {
    const eventData = JSON.parse(e.data);
    if (currentActiveCode && eventData.code === currentActiveCode) {
        alert("This Rakhi code has been deleted by the sender.");
        document.getElementById('anotherCodeBtn').click();
    }
});

let slideshowIntervalId = null;

couponForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const code = couponInput.value.trim().toUpperCase();
  if(!code) return;
  couponError.textContent = '';
  couponSubmit.disabled = true;
  couponSubmit.textContent = 'Checking...';

  const data = await getCoupon(code);

  couponSubmit.disabled = false;
  couponSubmit.textContent = 'Untie the Thread';

  if(!data){
    couponError.textContent = "That code doesn't match any rakhi. Please check and try again.";
    return;
  }
  
  currentActiveCode = code;
  
  // Start the 6-second Rakhi animation overlay
  const rakhiOverlay = document.getElementById('rakhiAnimationOverlay');
  rakhiOverlay.style.display = 'block';
  
  // Trigger fireworks again for the celebration!
  createCelebration();
  
  // Play song immediately during animation
  const revealAudio = document.getElementById('revealAudio');
  if(data.audio_file_id) {
    revealAudio.src = `/api/songs/${data.audio_file_id}/stream`;
    revealAudio.load(); // Force immediate load
    revealAudio.play().catch(e => console.warn('Audio autoplay prevented', e));
  } else {
    revealAudio.pause();
    revealAudio.src = '';
  }

  // Wait 6 seconds, then show the card
  setTimeout(() => {
      rakhiOverlay.style.display = 'none';
      showReveal(data);
  }, 6000);
});

function showReveal(data, isHotReload = false){
  couponSection.classList.add('hidden');
  revealSection.classList.remove('hidden');

  const photoWrap = document.getElementById('revealPhotoWrap');
  
  photoWrap.innerHTML = '';
  let photos = data.photos || (data.photo ? [data.photo] : []);
  if(photos.length > 0){
    photos.forEach((src, index) => {
      const img = document.createElement('img');
      img.src = src;
      // Show only the first image initially
      img.style.display = index === 0 ? 'block' : 'none';
      img.classList.add('slideshow-img');
      photoWrap.appendChild(img);
    });
    photoWrap.style.display = 'flex';
  } else {
    photoWrap.style.display = 'none';
  }
  
  // retrigger card animation if not a hot reload
  const face = document.getElementById('revealFace');
  if (!isHotReload) {
      face.style.animation = 'none';
      void face.offsetWidth;
      face.style.animation = '';
      burstSparkles();
      revealSection.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // SEQUENCE TIMING (after 6s animation)
  // 1. Start Typewriter and Slideshow immediately after card flips
  
  const messageEl = document.getElementById('revealMessage');
  const text = data.message || '';
  let i = 0;
  messageEl.textContent = '';
  
  const viewGiftBtn = document.getElementById('viewGiftBtn');
  viewGiftBtn.style.display = 'none'; // hide it initially
  
  function typeWriter() {
    if (i < text.length) {
      messageEl.textContent += text.charAt(i);
      i++;
      setTimeout(typeWriter, 50); // Typing speed
    } else {
      // Show View Gift button always
      viewGiftBtn.style.display = 'inline-block';
      viewGiftBtn.onclick = () => initScratchCard(data.giftImage || 'https://via.placeholder.com/300x300.png?text=Hidden+Gift');
    }
  }
  
  if (isHotReload) {
      messageEl.textContent = text;
      viewGiftBtn.style.display = 'inline-block';
      viewGiftBtn.onclick = () => initScratchCard(data.giftImage || 'https://via.placeholder.com/300x300.png?text=Hidden+Gift');
  } else {
      setTimeout(typeWriter, 1000); // Wait 1s for card flip
  }

  if(photos.length > 1) {
      setTimeout(startSlideshow, 1000);
  }

  function startSlideshow() {
      const imgs = photoWrap.querySelectorAll('img');
      let currentIdx = 0;
      
      slideshowIntervalId = setInterval(() => {
          imgs[currentIdx].style.display = 'none';
          currentIdx = (currentIdx + 1) % imgs.length;
          imgs[currentIdx].style.display = 'block';
      }, 3000); // Change every 3 seconds
  }
}

document.getElementById('anotherCodeBtn').addEventListener('click', ()=>{
  revealSection.classList.add('hidden');
  couponSection.classList.remove('hidden');
  couponInput.value = '';
  couponError.textContent = '';
  currentActiveCode = null;
  document.getElementById('revealAudio').pause();
  const messageEl = document.getElementById('revealMessage');
  messageEl.textContent = '';
  
  document.getElementById('viewGiftBtn').style.display = 'none';
  
  if(slideshowIntervalId) {
      clearInterval(slideshowIntervalId);
      slideshowIntervalId = null;
  }
  
  couponSection.scrollIntoView({behavior:'smooth', block:'start'});
});

/* ============================================================
   SCRATCH CARD LOGIC
   ============================================================ */
function initScratchCard(giftImageUrl) {
    const overlay = document.getElementById('scratchCardOverlay');
    const canvas = document.getElementById('scratchCanvas');
    const ctx = canvas.getContext('2d');
    const img = document.getElementById('scratchImage');
    
    img.src = giftImageUrl;
    overlay.classList.remove('hidden');
    
    // Setup Canvas
    const setCanvasSize = () => {
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = canvas.parentElement.offsetHeight;
        // Fill silver overlay
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add "Scratch Me" text
        ctx.fillStyle = '#666666';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Scratch Me!', canvas.width/2, canvas.height/2);
    };
    setCanvasSize();

    let isDrawing = false;
    
    const getCoordinates = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return [clientX - rect.left, clientY - rect.top];
    };

    const scratch = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const [x, y] = getCoordinates(e);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, 40, 0, Math.PI * 2); // Increased brush size from 20 to 40
        ctx.fill();
    };

    const checkReveal = () => {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        let transparent = 0;
        for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] === 0) transparent++;
        }
        const percentage = (transparent / (pixels.length / 4)) * 100;
        if (percentage > 30) { // Lowered threshold to 30%
            canvas.style.transition = 'opacity 0.5s ease';
            canvas.style.opacity = '0';
            setTimeout(() => {
                canvas.style.display = 'none';
            }, 500);
        }
    };

    canvas.addEventListener('mousedown', (e) => { isDrawing = true; scratch(e); });
    canvas.addEventListener('mousemove', scratch);
    canvas.addEventListener('mouseup', () => { isDrawing = false; checkReveal(); });
    canvas.addEventListener('mouseleave', () => { isDrawing = false; });
    
    canvas.addEventListener('touchstart', (e) => { isDrawing = true; scratch(e); });
    canvas.addEventListener('touchmove', scratch);
    canvas.addEventListener('touchend', () => { isDrawing = false; checkReveal(); });

    document.getElementById('revealAllBtn').onclick = () => {
        canvas.style.transition = 'opacity 0.5s ease';
        canvas.style.opacity = '0';
        setTimeout(() => {
            canvas.style.display = 'none';
        }, 500);
    };

    document.getElementById('closeScratchBtn').onclick = () => {
        overlay.classList.add('hidden');
        // Reset canvas for next time
        canvas.style.transition = 'none';
        canvas.style.opacity = '1';
        canvas.style.display = 'block';
    };
}

function burstSparkles(){
  const n = 26;
  for(let i=0;i<n;i++){
    const dot = document.createElement('div');
    dot.className = 'burst-dot';
    const angle = Math.random()*Math.PI*2;
    const dist = 80 + Math.random()*140;
    dot.style.setProperty('--bx', Math.cos(angle)*dist+'px');
    dot.style.setProperty('--by', Math.sin(angle)*dist+'px');
    dot.style.left = (window.innerWidth/2)+'px';
    dot.style.top = (window.innerHeight/2)+'px';
    dot.style.background = i%2===0 ? 'var(--marigold)' : 'var(--rose)';
    document.body.appendChild(dot);
    setTimeout(()=>dot.remove(), 950);
  }
}

/* Admin panel logic moved to admin.js */
