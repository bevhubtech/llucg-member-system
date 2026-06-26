const BASE = '';

export const getToken      = ()  => localStorage.getItem('mp_token');
export const setToken      = (t) => localStorage.setItem('mp_token', t);
export const clearToken    = ()  => {
    localStorage.removeItem('mp_token');
    localStorage.removeItem('mp_user');
    localStorage.removeItem('mp_role');
    localStorage.removeItem('mp_admin_id');
    localStorage.removeItem('mustChangePassword');
};
export const getUsername   = ()  => localStorage.getItem('mp_user') || 'Admin';
export const setUsername   = (u) => localStorage.setItem('mp_user', u);
export const clearUsername = ()  => localStorage.removeItem('mp_user');
export const getRole       = ()  => (localStorage.getItem('mp_role') || '').toLowerCase();
export const setRole       = (r) => localStorage.setItem('mp_role', (r || '').toLowerCase());
export const clearRole     = ()  => localStorage.removeItem('mp_role');
export const getAdminId    = ()  => localStorage.getItem('mp_admin_id');
export const setAdminId    = (id)=> localStorage.setItem('mp_admin_id', id);
export const clearAdminId  = ()  => localStorage.removeItem('mp_admin_id');

// Member portal tokens
export const getMemberToken   = ()  => localStorage.getItem('mp_member_token');
export const setMemberToken   = (t) => localStorage.setItem('mp_member_token', t);
export const clearMemberToken = ()  => {
    localStorage.removeItem('mp_member_token');
    localStorage.removeItem('mp_member_name');
};
export const getMemberName    = ()  => localStorage.getItem('mp_member_name') || '';
export const setMemberName    = (n) => localStorage.setItem('mp_member_name', n);
export const clearMemberName  = ()  => localStorage.removeItem('mp_member_name');

const addTokenToUrl = (path, token) => {
    if (!token) return path;
    const separator = path.includes('?') ? '&' : '?';
    // Remove duplicate token if already present (unlikely but safe)
    if (path.includes(`token=${token}`)) return path;
    return `${path}${separator}token=${token}&download=true`;
};


export const apiFetch = async (path, options = {}) => {
    const token = getToken();
    const isFormData = options.body instanceof FormData;
    const headers = { ...options.headers };
    if (!isFormData) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const res = await fetch(BASE + path, { ...options, headers, signal: controller.signal });
        clearTimeout(id);
        if (res.status === 401) {
            clearToken();
            clearUsername();
            window.location.href = '/login';
            return res;
        }
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || `Error ${res.status}`);
        }
        return res;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
};

export const memberFetch = async (path, options = {}) => {
    const token = getMemberToken();
    const headers = { ...options.headers };
    if (!options.body) {
        // No default content-type for bodyless requests
    } else if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const res = await fetch(BASE + path, { ...options, headers, signal: controller.signal });
        clearTimeout(id);
        if (res.status === 401) {
            clearMemberToken();
            clearMemberName();
            window.location.href = '/member/login';
            return res;
        }
        // Handle 2FA challenge status
        if (res.status === 430) return res;

        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || d.message || `Error ${res.status}`);
        }
        return res;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
};

export const downloadBlob = async (path, filename) => {
    try {
        const res = await apiFetch(path);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
        console.error('Download error:', err);
        alert('Download failed: ' + err.message);
    }
};

export const viewBlob = async (path) => {
    // Open synchronously to bypass popup blockers
    const newWindow = window.open('', '_blank');
    if (newWindow) newWindow.document.write('<html><body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fafafa;">Loading secure preview...</body></html>');
    
    try {
        const res = await apiFetch(path);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (newWindow) {
            newWindow.location.href = url;
        } else {
            window.open(url, '_blank'); // Try anyway if initial failed
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { 
        if (newWindow) newWindow.close();
        alert('View failed: ' + err.message); 
    }
};

export const memberDownloadNative = (path, filename) => {
    const token = getMemberToken();
    const url = addTokenToUrl(path, token);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
};

export const memberDownloadBlob = async (path, filename) => {
    try {
        const res = await memberFetch(path);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
        console.error('Member download error:', err);
        alert('Download failed: ' + err.message);
    }
};

export const memberViewBlob = async (path) => {
    const newWindow = window.open('', '_blank');
    if (newWindow) newWindow.document.write('<html><body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fafafa;">Loading secure preview...</body></html>');
    
    try {
        const token = getMemberToken();
        const url = addTokenToUrl(path, token);
        const res = await fetch(url); // Use fetch with URL containing token
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (newWindow) {
            newWindow.location.href = blobUrl;
        } else {
            window.open(blobUrl, '_blank');
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) { 
        if (newWindow) newWindow.close();
        alert('View failed: ' + err.message); 
    }
};

export const getRoleLabel = (role, features) => {
    if (!role) return '';
    let f = features;
    if (!f || Object.keys(f).length === 0) {
        try { f = JSON.parse(localStorage.getItem('system_features') || '{}'); } catch(e) { f = {}; }
    }
    const key = `role_label_${role}`;
    if (f[key]) return f[key];
    if (role === 'superadmin') return 'System Administrator';
    if (role === 'ict_admin') return 'ICT Administrator';
    if (role === 'finance_admin') return 'Finance Administrator';
    return role.split('_').map(w => {
        if (w.toLowerCase() === 'ict') return 'ICT';
        return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
};
