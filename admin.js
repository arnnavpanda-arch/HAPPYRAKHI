/* ============================================================
   CONFIG
   ============================================================ */
// Change this before sharing the site publicly. This is a simple
// client-side gate for a personal gift site — not real security.
const ADMIN_PASSWORD = "sister2026";
const STORAGE_PREFIX = "coupon:";
const SHARED = true; // coupons are shared so any visitor can redeem them



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


const adminLoginView = document.getElementById('adminLoginView');
const adminPanelView = document.getElementById('adminPanelView');
const adminPasswordInput = document.getElementById('adminPassword');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminLoginStatus = document.getElementById('adminLoginStatus');

adminLoginBtn.addEventListener('click', ()=>{
  if(adminPasswordInput.value === ADMIN_PASSWORD){
    adminLoginView.style.display = 'none';
    adminPanelView.style.display = 'block';
    adminLoginStatus.textContent = '';
    renderAdminList();
  }else{
    adminLoginStatus.textContent = 'Incorrect password. Try again.';
  }
});
adminPasswordInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') adminLoginBtn.click(); });

function resizeImage(file, maxWidth = 600, quality = 0.6){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const addCouponForm = document.getElementById('addCouponForm');
const addCouponStatus = document.getElementById('addCouponStatus');
const photoPreviewList = document.getElementById('photoPreviewList');
const newPhotoInput = document.getElementById('newPhoto');
const adminList = document.getElementById('adminList');
let pendingPhotos = [];
let editingGiftImage = null; // Store existing gift image base64 if editing

function resetForm() {
    addCouponForm.reset();
    pendingPhotos = [];
    editingGiftImage = null;
    renderPhotoPreviews();
    document.getElementById('newCode').readOnly = false;
    addCouponStatus.textContent = '';
    document.getElementById('saveCodeBtn').textContent = 'Save Code';
}

document.getElementById('clearFormBtn').addEventListener('click', resetForm);

function renderPhotoPreviews() {
  photoPreviewList.innerHTML = '';
  pendingPhotos.forEach((dataUrl, idx) => {
    const wrap = document.createElement('div');
    wrap.style = "position:relative; width:44px; height:44px;";
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style = "width:100%; height:100%; object-fit:cover; border-radius:4px;";
    const rmBtn = document.createElement('button');
    rmBtn.innerHTML = "×";
    rmBtn.type = "button";
    rmBtn.style = "position:absolute; top:-4px; right:-4px; background:var(--rose); color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:12px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center;";
    rmBtn.onclick = () => {
      pendingPhotos.splice(idx, 1);
      renderPhotoPreviews();
    };
    wrap.appendChild(img);
    wrap.appendChild(rmBtn);
    photoPreviewList.appendChild(wrap);
  });
}

newPhotoInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  if(!files || files.length === 0) return;
  addCouponStatus.className = 'status-msg';
  addCouponStatus.textContent = 'Processing image...';
  try {
    for(let i=0; i<files.length; i++){
      const dataUrl = await resizeImage(files[i]);
      pendingPhotos.push(dataUrl);
    }
    renderPhotoPreviews();
    addCouponStatus.textContent = '';
  } catch (err) {
    console.error(err);
    addCouponStatus.className = 'status-msg err';
    addCouponStatus.textContent = 'Failed to load image.';
  }
  newPhotoInput.value = ''; // reset input
});

addCouponForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const code = document.getElementById('newCode').value.trim().toUpperCase();
  const message = document.getElementById('newMessage').value.trim();
  const fileInput = document.getElementById('newPhoto');
  const files = fileInput.files;
  const audioInput = document.getElementById('newAudio');
  const audioFile = audioInput.files[0];
  const giftInput = document.getElementById('newGiftImage');
  const giftFile = giftInput.files[0];

  if(!code || !message){
    addCouponStatus.className = 'status-msg err';
    addCouponStatus.textContent = 'Code and message are required.';
    return;
  }

  addCouponStatus.className = 'status-msg';
  addCouponStatus.textContent = 'Saving...';

  try{
    let giftBase64 = editingGiftImage; // use existing if no new one
    if (giftFile) {
        addCouponStatus.textContent = 'Processing gift image...';
        giftBase64 = await resizeImage(giftFile);
    }
    addCouponStatus.textContent = 'Saving...';

    const result = await setCoupon(code, {
      message,
      photos: [...pendingPhotos],
      giftImage: giftBase64,
      createdAt: new Date().toISOString()
    }, audioFile);
    if(!result){
      throw new Error('Storage returned no result');
    }
    addCouponStatus.className = 'status-msg ok';
    addCouponStatus.textContent = `Saved! Code "${code}" is ready to share.`;
    resetForm();
    renderAdminList();
  }catch(err){
    console.error(err);
    addCouponStatus.className = 'status-msg err';
    addCouponStatus.textContent = 'Error saving: ' + (err.message || 'Storage full or invalid');
  }
});

async function renderAdminList(){
  const listEl = document.getElementById('adminList');
  listEl.innerHTML = '<div class="status-msg">Loading codes...</div>';
  const keys = await listCoupons();

  if(keys.length === 0){
    listEl.innerHTML = '<div class="status-msg">No codes yet. Add your first one above.</div>';
    return;
  }

  listEl.innerHTML = '';
  for(const key of keys){
    const code = key.replace(STORAGE_PREFIX, '');
    let data = await getCoupon(code);
    if(!data) continue;

    const item = document.createElement('div');
    item.className = 'admin-item';
    const thumbWrap = document.createElement('div');
    let photos = data.photos || (data.photo ? [data.photo] : []);
    if(photos.length > 0) {
        thumbWrap.innerHTML = `<img src="${photos[0]}" alt="">`;
    } else {
        thumbWrap.innerHTML = '<div style="width:44px;height:44px;border-radius:8px;background:rgba(212,175,55,0.15);flex-shrink:0;"></div>';
    }
    
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `
        <div class="code">${code}</div>
        <div class="msg-preview">${(data.message||'').slice(0,60)}</div>
    `;

    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.gap = '6px';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.color = '#fff';
    editBtn.style.borderColor = 'rgba(255,255,255,0.4)';
    editBtn.onclick = async () => {
      resetForm();
      const data = await getCoupon(code);
      if(data) {
          document.getElementById('newCode').value = code;
          document.getElementById('newCode').readOnly = true;
          document.getElementById('newMessage').value = data.message || '';
          pendingPhotos = data.photos || (data.photo ? [data.photo] : []);
          editingGiftImage = data.giftImage || null;
          renderPhotoPreviews();
          document.getElementById('saveCodeBtn').textContent = 'Update Code';
          document.getElementById('couponSection').scrollIntoView({behavior:'smooth'});
      }
    };
    
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = async ()=>{
      if(confirm(`Delete coupon "${code}"?`)){
        await deleteCoupon(code);
        renderAdminList();
      }
    };

    btnWrap.appendChild(editBtn);
    btnWrap.appendChild(delBtn);

    item.appendChild(thumbWrap.firstElementChild);
    item.appendChild(info);
    item.appendChild(btnWrap);
    listEl.appendChild(item);
  }
}

/* ============================================================
   REAL-TIME SYNC (SSE)
   ============================================================ */
const evtSource = new EventSource('/api/stream');
evtSource.addEventListener('coupon_updated', () => {
    // If the admin list is currently visible, refresh it
    if(document.getElementById('adminPanelView').style.display !== 'none') {
        renderAdminList();
    }
});
evtSource.addEventListener('coupon_deleted', () => {
    if(document.getElementById('adminPanelView').style.display !== 'none') {
        renderAdminList();
    }
});
