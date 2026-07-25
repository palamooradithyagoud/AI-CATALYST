/**
 * SkillRecommender — Premium SaaS Frontend Logic
 * Strictly Vanilla JS (no frameworks)
 */
window.escapeHTML = function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

document.addEventListener('DOMContentLoaded', () => {
    // Selectors
    const skillInput = document.getElementById('skill-input');
    const levelDropdown = document.getElementById('level-dropdown');
    const languageDropdown = document.getElementById('language-dropdown');
    const ctaButton = document.getElementById('cta-button');
    const loadingIndicator = document.getElementById('loading');
    const emptyState = document.getElementById('empty-state');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // Steps & Grids
    const resultsNav = document.getElementById('results-nav');
    const playlistStep = document.getElementById('playlist-step');
    const certificateStep = document.getElementById('certificate-step');
    const playlistGrid = document.getElementById('playlist-grid');
    const certificateGrid = document.getElementById('certificate-grid');

    // Tabs
    const tabPlaylists = document.getElementById('tab-playlists');
    const tabCertificates = document.getElementById('tab-certificates');
    const tabRoadmap = document.getElementById('tab-roadmap');
    const tierLabelBadge = document.getElementById('tier-label-badge');

    // Roadmap UI
    const roadmapStep = document.getElementById('roadmap-step');
    const roadmapContent = document.getElementById('roadmap-content');
    
    // AI Recommendations UI
    const aiRecommendations = document.getElementById('ai-recommendations');
    const aiRecommendationsGrid = document.getElementById('ai-recommendations-grid');
    const tierIndicator = document.getElementById('tier-indicator');

    // Session ID (anonymous tracking)
    let sessionId = sessionStorage.getItem('sp_sid');
    if (!sessionId) {
        sessionId = 'sp_' + Math.random().toString(36).substr(2, 12);
        sessionStorage.setItem('sp_sid', sessionId);
    }
    let currentUserId = null;

    // Local results store
    let currentSkill = '';
    let currentResults = {};

    // Active Roadmap state
    let activeRoadmap = null;

    // Saved playlists management state and actions
    let savedPlaylists = [];
    const generateVideosForPlaylist = (title, skill) => {
        const t = (title + ' ' + (skill || '')).toLowerCase();
        let topics = [];
        if (t.includes('java') && !t.includes('javascript')) {
            topics = [
                "Introduction to Java & Setup",
                "Variables and Data Types in Java",
                "Operators & Conditional Logic",
                "Loops in Java (For, While)",
                "Classes, Objects & Constructors",
                "Method Overloading & Overriding",
                "Inheritance & Polymorphism",
                "Abstraction & Interfaces",
                "Packages & Access Modifiers",
                "Exception Handling in Java"
            ];
        } else if (t.includes('python')) {
            topics = [
                "Python Installation & Basics",
                "Control Flow and Loops",
                "Functions & Argument Scope",
                "Lists, Tuples & Dictionaries",
                "File I/O Operations",
                "Object Oriented Python Basics",
                "Modules and PIP Packages",
                "Exception Handling in Python",
                "Lambda & List Comprehensions",
                "Intro to Pandas & NumPy"
            ];
        } else if (t.includes('c++') || t.includes('cpp')) {
            topics = [
                "C++ Introduction & Setup",
                "Variables, Constants & Operators",
                "Control Statements & Loops",
                "Functions & Memory Addresses",
                "Pointers and References",
                "Array Manipulation",
                "Classes and Object Instantiation",
                "Inheritance & Polymorphism",
                "STL Containers & Iterators",
                "File Streams & Exceptions"
            ];
        } else if (t.includes('c ') || t.startsWith('c ') || t.includes(' c ') || t.endsWith(' c') || t.includes('c datastructure') || t.includes('data structure')) {
            topics = [
                "Introduction to DSA & Big O",
                "Arrays & Dynamic Arrays",
                "Singly and Doubly Linked Lists",
                "Stacks & Queues",
                "Recursion & Binary Search",
                "Trees & Binary Search Trees",
                "Heaps & Priority Queues",
                "Graphs Representation (BFS/DFS)",
                "Hashing & Hash Maps",
                "Sorting Algorithms Complexity"
            ];
        } else {
            // General fallback
            topics = [
                "Introduction & Overview",
                "Environment Setup",
                "Variables & Operations",
                "Conditionals & Control Flow",
                "Functions & Parameters",
                "Working with Collections",
                "Errors & Exception Handling",
                "Debugging Techniques",
                "Mini-Project Implementation",
                "Final Review & Next Steps"
            ];
        }
        
        return topics.map((topicName, idx) => ({
            id: idx + 1,
            title: topicName,
            completed: false
        }));
    };

    const getSavedPlaylists = () => {
        return savedPlaylists;
    };

    const togglePlaylistSave = async (playlist, btnEl) => {
        const index = savedPlaylists.findIndex(p => p.url === playlist.url);
        if (index > -1) {
            // Remove it
            savedPlaylists.splice(index, 1);
            if (btnEl) {
                btnEl.textContent = 'Save';
                btnEl.classList.remove('saved');
            }
            showToast('Removed from saved playlists');
            syncSavedPlaylists(savedPlaylists);
            renderSavedPlaylists();
            updateCommandCenter();
        } else {
            // Add it — fetch real videos from YouTube API
            playlist.savedAt = new Date().toISOString();
            playlist.completed = false;

            if (btnEl) {
                btnEl.textContent = 'Loading...';
                btnEl.disabled = true;
            }

            try {
                const resp = await fetch(`/get-playlist-videos?playlist_url=${encodeURIComponent(playlist.url)}`);
                const data = await resp.json();
                if (data.videos && data.videos.length > 0) {
                    playlist.videos = data.videos;
                    showToast(`Saved! ${data.total} videos loaded from playlist`);
                } else {
                    // Fallback to generated videos
                    playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
                    showToast('Saved! (Using estimated video list)');
                }
            } catch (err) {
                console.error('Failed to fetch playlist videos:', err);
                playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
                showToast('Saved! (Using estimated video list)');
            }

            savedPlaylists.push(playlist);
            if (btnEl) {
                btnEl.textContent = 'Saved';
                btnEl.classList.add('saved');
                btnEl.disabled = false;
            }
            syncSavedPlaylists(savedPlaylists);
            renderSavedPlaylists();
            updateCommandCenter();
            
            // Track save event to DB
            trackClick(playlist.url, playlist.title, 'save');
        }
    };

    const togglePlaylistCompleted = (url, isChecked) => {
        const playlist = savedPlaylists.find(p => p.url === url);
        if (playlist) {
            playlist.completed = isChecked;
            playlist.completedAt = isChecked ? new Date().toISOString() : null;
            if (!playlist.videos) {
                playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
            }
            playlist.videos.forEach(v => {
                v.completed = isChecked;
            });
            syncSavedPlaylists(savedPlaylists);
            renderSavedPlaylists();
            updateCommandCenter();
            showToast(isChecked ? 'All videos completed!' : 'Marked incomplete');

            // Track complete event to DB if marked as complete
            if (isChecked) {
                trackClick(playlist.url, playlist.title, 'complete');
            }
        }
    };

    const toggleVideoCompleted = (playlistUrl, videoId, isChecked, cardEl) => {
        const playlist = savedPlaylists.find(p => p.url === playlistUrl);
        if (playlist) {
            if (!playlist.videos) {
                playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
            }
            const video = playlist.videos.find(v => String(v.id) === String(videoId));
            if (video) {
                video.completed = isChecked;
            }
            
            // Re-calculate playlist completion
            const total = playlist.videos.length;
            const completedCount = playlist.videos.filter(v => v.completed).length;
            const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
            const wasCompleted = playlist.completed;
            playlist.completed = (total > 0 && completedCount === total);
            playlist.completedAt = playlist.completed ? new Date().toISOString() : null;

            // In-place UI update to prevent list collapse and immediately update card progress
            if (cardEl) {
                const progressBar = cardEl.querySelector('.saved-playlist-progress-bar');
                if (progressBar) progressBar.style.width = `${progressPct}%`;

                const progressText = cardEl.querySelector('.saved-playlist-progress-text');
                if (progressText) progressText.textContent = `${completedCount} of ${total} videos completed (${progressPct}%)`;

                const mainCheck = cardEl.querySelector('.playlist-complete-checkbox');
                if (mainCheck) mainCheck.checked = playlist.completed;

                const mainCheckLabel = cardEl.querySelector('.saved-playlist-check span');
                if (mainCheckLabel) mainCheckLabel.textContent = playlist.completed ? 'Done' : 'Mark Done';

                const videoCb = cardEl.querySelector(`.video-checkbox[data-video-id="${CSS.escape(String(videoId))}"]`);
                const videoItem = videoCb ? videoCb.closest('.playlist-video-item') : null;
                if (videoItem) {
                    if (isChecked) videoItem.classList.add('completed');
                    else videoItem.classList.remove('completed');
                }

                const completedCountEl = document.getElementById('completed-playlists-count');
                if (completedCountEl) {
                    const completedTotal = savedPlaylists.filter(p => p.completed).length;
                    completedCountEl.textContent = completedTotal;
                }
            } else {
                renderSavedPlaylists();
            }

            syncSavedPlaylists(savedPlaylists);
            updateCommandCenter();
            
            showToast(`Video marked ${isChecked ? 'completed' : 'incomplete'} (${completedCount}/${total})`);

            // Track complete event to DB if all videos were completed by checking this box
            if (playlist.completed && !wasCompleted) {
                trackClick(playlist.url, playlist.title, 'complete');
            }
        }
    };

    const removePlaylist = (url) => {
        savedPlaylists = savedPlaylists.filter(p => p.url !== url);
        syncSavedPlaylists(savedPlaylists);
        renderSavedPlaylists();
        updateCommandCenter();
        showToast('Removed playlist');
        
        // Also update any visible buttons on screen
        document.querySelectorAll(`.btn-save-playlist[data-url="${url}"]`).forEach(btn => {
            btn.textContent = 'Save';
            btn.classList.remove('saved');
        });
    };

    const syncSavedPlaylists = async (savedList) => {
        try {
            await fetch('/sync-saved-playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlists_list: savedList })
            });
        } catch (e) {
            console.error("Failed to sync saved playlists to DB:", e);
        }
    };

    const renderSavedPlaylists = () => {
        const saved = getSavedPlaylists();
        const savedCountEl = document.getElementById('saved-playlists-count');
        const completedCountEl = document.getElementById('completed-playlists-count');
        const savedBadge = document.getElementById('learning-saved-badge');
        const listContainer = document.getElementById('saved-playlists-list');

        if (savedCountEl) savedCountEl.textContent = saved.length;
        if (savedBadge) savedBadge.textContent = `${saved.length} Saved`;
        
        const completedCount = saved.filter(p => p.completed).length;
        if (completedCountEl) completedCountEl.textContent = completedCount;

        if (!listContainer) return;

        if (saved.length === 0) {
            listContainer.innerHTML = `<p class="empty-state" style="padding:20px 0; font-size:0.9rem; margin:0; text-align:center;">No playlists saved yet. Go to <strong>Explore</strong> card to search skills and save playlists.</p>`;
            return;
        }

        listContainer.innerHTML = '';
        saved.forEach(p => {
            const card = document.createElement('div');
            card.className = 'saved-playlist-card';
            
            const totalCount = p.videos ? p.videos.length : 0;
            const completedCount = p.videos ? p.videos.filter(v => v.completed).length : 0;
            const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const statusBadgeHTML = p.completed
                ? `<span class="pill-badge status-verified-badge" style="background:rgba(16, 185, 129, 0.15); color:var(--success); font-size:0.75rem; font-weight:700; padding:5px 12px; border-radius:99px; display:inline-flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Completed</span>`
                : (completedCount > 0
                    ? `<span class="pill-badge status-progress-badge" style="background:rgba(56, 189, 248, 0.15); color:#38bdf8; font-size:0.75rem; font-weight:700; padding:5px 12px; border-radius:99px; display:inline-flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#38bdf8" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> ${progressPct}% Verified</span>`
                    : `<span class="pill-badge status-pending-badge" style="background:var(--bg-main); color:var(--text-muted); border:1px solid var(--border); font-size:0.75rem; font-weight:600; padding:5px 12px; border-radius:99px; display:inline-flex; align-items:center; gap:4px;">Not Started</span>`);

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
                    <div class="saved-playlist-info">
                        <div class="saved-playlist-title">${escapeHTML(p.title)}</div>
                        <div class="saved-playlist-meta">
                            ${escapeHTML(p.channel)} | ${escapeHTML(p.skill)} | ${escapeHTML(p.level)}
                        </div>
                    </div>
                    <div class="saved-playlist-actions" style="margin-left: auto; display:flex; align-items:center; gap:12px;">
                        ${statusBadgeHTML}
                        <button class="btn-watch btn-open-player" data-url="${escapeHTML(p.url)}" style="padding: 6px 14px; font-size: 0.75rem; border-radius: var(--radius-sm); border:none; cursor:pointer; font-weight:700; background:var(--primary); color:#fff;">Watch</button>
                        <button class="btn-remove-saved" data-url="${escapeHTML(p.url)}">Delete</button>
                    </div>
                </div>
                
                <!-- Progress Bar -->
                <div style="margin-top: 12px;">
                    <div style="width: 100%; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; margin-bottom: 4px;">
                        <div class="saved-playlist-progress-bar" style="width: ${progressPct}%; height: 100%; background: var(--success); transition: width 0.3s var(--smooth);"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="saved-playlist-progress-text" style="font-size: 0.75rem; color: var(--text-sub); font-weight: 500;">
                            ${completedCount} of ${totalCount} videos verified (${progressPct}%)
                        </span>
                        <button class="saved-playlist-videos-toggle" data-expanded="false" style="font-size:0.75rem; color:var(--primary); background:none; border:none; cursor:pointer; font-weight:700;">
                            Show Videos (${totalCount})
                        </button>
                    </div>
                </div>

                <!-- Collapsible Video Checklist -->
                <div class="playlist-videos-list" style="display: none;">
                    ${(p.videos || []).map((v, vIdx) => `
                        <div class="playlist-video-item ${v.completed ? 'completed' : ''}" data-video-index="${vIdx}" style="display:flex; align-items:center; gap:10px; width:100%;">
                            <span class="video-status-icon" style="font-size:0.85rem;" title="${v.completed ? 'Verified completion via watch timer' : 'Watch video in player to complete'}">
                                ${v.completed ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'}
                            </span>
                            <span class="btn-play-video-item" style="cursor:pointer; flex:1; font-weight:${v.completed ? '500' : '600'};">${v.displayNum || (vIdx + 1)}. ${escapeHTML(v.title)}</span>
                            <button class="btn-play-video-item btn-watch" style="padding:4px 10px; font-size:0.7rem; border-radius:4px; font-weight:700;">Play</button>
                        </div>
                    `).join('')}
                </div>
            `;

            // Expand/Collapse Listener
            const toggleBtn = card.querySelector('.saved-playlist-videos-toggle');
            const videosList = card.querySelector('.playlist-videos-list');
            toggleBtn.addEventListener('click', () => {
                const isExpanded = toggleBtn.getAttribute('data-expanded') === 'true';
                if (isExpanded) {
                    videosList.style.display = 'none';
                    toggleBtn.setAttribute('data-expanded', 'false');
                    toggleBtn.textContent = `Show Videos (${totalCount})`;
                } else {
                    videosList.style.display = 'flex';
                    toggleBtn.setAttribute('data-expanded', 'true');
                    toggleBtn.textContent = `Hide Videos`;
                }
            });

            // Open Player Watch Listener
            const openPlayerBtn = card.querySelector('.btn-open-player');
            if (openPlayerBtn) {
                openPlayerBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openLearningPlayer(p.url, 0);
                });
            }

            card.querySelectorAll('.btn-play-video-item').forEach((btnItem) => {
                btnItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const vIdx = parseInt(btnItem.closest('.playlist-video-item').getAttribute('data-video-index') || 0);
                    openLearningPlayer(p.url, vIdx);
                });
            });

            card.querySelector('.btn-remove-saved').addEventListener('click', () => {
                removePlaylist(p.url);
            });

            listContainer.appendChild(card);
        });
    };

    const initSavedPlaylists = async () => {
        try {
            const res = await fetch('/get-saved-playlists');
            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list)) {
                    let changed = false;
                    savedPlaylists = list.map(p => {
                        if (!p.videos || p.videos.length === 0) {
                            p.videos = generateVideosForPlaylist(p.title, p.skill);
                            changed = true;
                        }
                        return p;
                    });
                    if (changed) {
                        syncSavedPlaylists(savedPlaylists);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch saved playlists from DB:", e);
        }
        renderSavedPlaylists();
    };

    const switchLearningCard = (cardName) => {
        const cardExplore = document.getElementById('card-nav-explore');
        const cardSaved = document.getElementById('card-nav-saved');
        const contentExplore = document.getElementById('learning-card-explore-content');
        const contentSaved = document.getElementById('learning-card-saved-content');

        if (cardName === 'saved') {
            if (cardExplore) cardExplore.classList.remove('active');
            if (cardSaved) cardSaved.classList.add('active');
            if (contentExplore) contentExplore.style.display = 'none';
            if (contentSaved) contentSaved.style.display = 'block';
            renderSavedPlaylists();
        } else {
            if (cardSaved) cardSaved.classList.remove('active');
            if (cardExplore) cardExplore.classList.add('active');
            if (contentSaved) contentSaved.style.display = 'none';
            if (contentExplore) contentExplore.style.display = 'block';
        }
    };

    const cardExploreBtn = document.getElementById('card-nav-explore');
    const cardSavedBtn = document.getElementById('card-nav-saved');
    if (cardExploreBtn) {
        cardExploreBtn.addEventListener('click', () => switchLearningCard('explore'));
    }
    if (cardSavedBtn) {
        cardSavedBtn.addEventListener('click', () => switchLearningCard('saved'));
    }

    // ── LEARNING PLAYER SYSTEM (Coursera / Udemy Style) ──────────
    let currentPlaylist = null;
    let currentVideoIndex = 0;
    let ytPlayer = null;
    let watchProgressTimer = null;
    let antiCheatTimer = null;
    let lastPlayerTime = 0;
    let watchedSecondsCounter = 0;
    let activeVideoCompleted = false;

    const extractYouTubeVideoId = (url) => {
        if (!url) return '';
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : '';
    };

    const extractYouTubePlaylistId = (url) => {
        if (!url) return '';
        const match = url.match(/[?&]list=([A-Za-z0-9_\-]+)/);
        return match ? match[1] : '';
    };

    const getFallbackVideoId = (skill = '', title = '') => {
        const s = (skill + ' ' + title).toLowerCase();
        if (s.includes('python')) return 'rfscVS0vtbw'; // freeCodeCamp - Python for Beginners
        if (s.includes('java') && !s.includes('javascript')) return 'eIrMbAQSU34'; // Programming with Mosh - Java
        if (s.includes('javascript') || s.includes('js') || s.includes('web')) return 'PkZNo7MFNFg'; // freeCodeCamp - JavaScript
        if (s.includes('c++') || s.includes('cpp') || s.includes('c ')) return 'vLnPwxZdW4Y'; // freeCodeCamp - C++
        if (s.includes('dsa') || s.includes('algo') || s.includes('data structure')) return '8hly31xKLI0'; // freeCodeCamp - DSA
        if (s.includes('react')) return 'bMknfKXIFA8'; // freeCodeCamp - React
        if (s.includes('machine learning') || s.includes('ai')) return 'i_LwzRVP7bg'; // freeCodeCamp - ML
        return 'rfscVS0vtbw'; // Default Python / Coding fallback
    };

    const openLearningPlayer = (playlistUrl, videoIndex = 0) => {
        const saved = getSavedPlaylists();
        let targetPlaylist = saved.find(p => p.url === playlistUrl);

        if (!targetPlaylist) {
            let gridMatch = null;
            if (currentResults && currentResults.playlists) {
                gridMatch = currentResults.playlists.find(p => p.url === playlistUrl);
            }
            targetPlaylist = {
                url: playlistUrl,
                title: gridMatch ? gridMatch.title : 'Course Playlist',
                channel: gridMatch ? gridMatch.channel : 'YouTube',
                skill: currentSkill || 'General',
                level: gridMatch ? gridMatch.level : 'All Levels',
                completed: false,
                videos: generateVideosForPlaylist(gridMatch ? gridMatch.title : 'Playlist', currentSkill)
            };
        }

        if (targetPlaylist.videos) {
            targetPlaylist.videos.forEach((v, idx) => {
                if (typeof v.id !== 'number' || v.id > 1000) v.id = idx + 1;
                v.displayNum = idx + 1;
                if (!v.videoId) v.videoId = extractYouTubeVideoId(v.url || targetPlaylist.url);
                if (v.watchedSeconds === undefined) v.watchedSeconds = 0;
                if (v.lastPosition === undefined) v.lastPosition = 0;
                if (v.completed === undefined) v.completed = false;
            });
        }

        currentPlaylist = targetPlaylist;
        currentVideoIndex = (videoIndex >= 0 && videoIndex < currentPlaylist.videos.length) ? videoIndex : 0;

        switchView('view-player');

        renderPlayerHeader();
        renderPlayerSidebar();
        loadCurrentVideo();
    };

    const renderPlayerHeader = () => {
        if (!currentPlaylist) return;
        const titleEl = document.getElementById('player-playlist-title');
        const metaEl = document.getElementById('player-playlist-meta');
        if (titleEl) titleEl.textContent = currentPlaylist.title;
        if (metaEl) metaEl.textContent = `${currentPlaylist.channel} • ${currentPlaylist.skill} • ${currentPlaylist.level}`;

        const total = currentPlaylist.videos ? currentPlaylist.videos.length : 0;
        const completedCount = currentPlaylist.videos ? currentPlaylist.videos.filter(v => v.completed).length : 0;
        const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

        const pctEl = document.getElementById('player-completion-pct-text');
        const countEl = document.getElementById('player-completion-count-text');
        if (pctEl) pctEl.textContent = `${pct}% Completed`;
        if (countEl) countEl.textContent = `${completedCount} of ${total} videos`;
    };

    const renderPlayerSidebar = () => {
        if (!currentPlaylist || !currentPlaylist.videos) return;
        const listContainer = document.getElementById('player-sidebar-video-list');
        const badge = document.getElementById('player-sidebar-count-badge');
        if (badge) badge.textContent = `${currentPlaylist.videos.length} Videos`;

        if (!listContainer) return;
        listContainer.innerHTML = '';

        currentPlaylist.videos.forEach((v, idx) => {
            const item = document.createElement('div');
            item.className = `player-sidebar-item ${idx === currentVideoIndex ? 'active' : ''} ${v.completed ? 'completed' : ''}`;
            
            item.innerHTML = `
                <span class="item-index">${idx === currentVideoIndex ? '' : `#${idx + 1}`}</span>
                <span class="item-title">${escapeHTML(v.title)}</span>
                <span class="item-status">${v.completed ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</span>
            `;

            item.addEventListener('click', () => {
                if (idx !== currentVideoIndex) {
                    syncCurrentWatchProgress();
                    currentVideoIndex = idx;
                    loadCurrentVideo();
                }
            });

            listContainer.appendChild(item);
        });
    };

    const loadCurrentVideo = () => {
        if (!currentPlaylist || !currentPlaylist.videos[currentVideoIndex]) return;

        const video = currentPlaylist.videos[currentVideoIndex];
        activeVideoCompleted = video.completed || false;
        watchedSecondsCounter = video.watchedSeconds || 0;
        lastPlayerTime = 0;

        const resumeOverlay = document.getElementById('player-resume-overlay');
        if (resumeOverlay) resumeOverlay.style.display = 'none';

        const vidTitle = document.getElementById('player-video-title') || document.getElementById('player-current-video-title');
        const vidChannel = document.getElementById('player-channel-name') || document.getElementById('player-current-video-desc');
        if (vidTitle) vidTitle.textContent = `${video.displayNum || (currentVideoIndex + 1)}. ${video.title}`;
        if (vidChannel) vidChannel.textContent = `${currentPlaylist.channel || 'YouTube'} • ${currentPlaylist.skill || 'Course'}`;

        renderPlayerHeader();
        renderPlayerSidebar();

        let ytId = video.videoId || extractYouTubeVideoId(video.url || '');
        if (!ytId) {
            ytId = extractYouTubeVideoId(currentPlaylist.url || '');
        }
        const fallbackId = getFallbackVideoId(currentPlaylist.skill || currentSkill || currentPlaylist.title, video.title);
        const finalYtId = ytId || fallbackId;

        // Update External Watch link button if present
        const externalLinkBtn = document.getElementById('player-youtube-external-link');
        if (externalLinkBtn) {
            externalLinkBtn.href = video.url || `https://www.youtube.com/watch?v=${finalYtId}`;
        }

        const playerAnchor = document.getElementById('yt-player-anchor');

        if (playerAnchor) {
            const embedSrc = `https://www.youtube.com/embed/${finalYtId}?rel=0&modestbranding=1`;

            playerAnchor.innerHTML = `
                <iframe 
                    width="100%" 
                    height="480" 
                    src="${embedSrc}" 
                    title="${escapeHTML(video.title)}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" 
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen 
                    style="border:0; width:100%; height:100%; min-height:480px; display:block; border-radius:16px;"
                ></iframe>
            `;
        }
    };

    const onYTPlayerReady = (event) => {
        checkResumePrompt();
    };

    const checkResumePrompt = () => {
        if (!currentPlaylist || !currentPlaylist.videos[currentVideoIndex]) return;
        const video = currentPlaylist.videos[currentVideoIndex];
        const savedPos = video.lastPosition || 0;

        if (savedPos > 5 && !video.completed) {
            const mins = Math.floor(savedPos / 60);
            const secs = Math.floor(savedPos % 60);
            const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            const resumeOverlay = document.getElementById('player-resume-overlay');
            const resumeText = document.getElementById('player-resume-time-text');
            const btnResume = document.getElementById('player-btn-resume');

            if (resumeText) resumeText.textContent = `You previously watched up to ${formatted}.`;
            if (btnResume) btnResume.textContent = `Continue watching from ${formatted}`;
            if (resumeOverlay) resumeOverlay.style.display = 'flex';

            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                try { ytPlayer.pauseVideo(); } catch(e){}
            }
        }
    };

    const onYTPlayerStateChange = (event) => {
        const pState = window.YT ? window.YT.PlayerState : { PLAYING: 1, ENDED: 0 };
        if (event && event.data === pState.PLAYING) {
            startWatchTimers();
        } else {
            stopWatchTimers();
        }

        if (event && event.data === pState.ENDED) {
            syncCurrentWatchProgress();
            const dur = (ytPlayer && typeof ytPlayer.getDuration === 'function') ? ytPlayer.getDuration() : 0;
            checkAutoCompletion(dur, dur);
        }
    };

    const startWatchTimers = () => {
        stopWatchTimers();

        antiCheatTimer = setInterval(() => {
            if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
            const curr = ytPlayer.getCurrentTime() || 0;
            const dur = (typeof ytPlayer.getDuration === 'function') ? (ytPlayer.getDuration() || 0) : 0;

            if (lastPlayerTime > 0) {
                const delta = curr - lastPlayerTime;
                if (delta > 0 && delta <= 2.5) {
                    watchedSecondsCounter += delta;
                }
            }
            lastPlayerTime = curr;

            updateLiveProgressUI(curr, dur);
            checkAutoCompletion(curr, dur);
        }, 1000);

        watchProgressTimer = setInterval(() => {
            syncCurrentWatchProgress();
        }, 5000);
    };

    const stopWatchTimers = () => {
        if (antiCheatTimer) clearInterval(antiCheatTimer);
        if (watchProgressTimer) clearInterval(watchProgressTimer);
        antiCheatTimer = null;
        watchProgressTimer = null;
    };

    const updateLiveProgressUI = (curr, dur) => {
        const fill = document.getElementById('player-live-progress-fill');
        const text = document.getElementById('player-live-time-display');

        if (dur > 0) {
            const pct = Math.min(100, Math.round((curr / dur) * 100));
            if (fill) fill.style.width = `${pct}%`;

            const currMin = Math.floor(curr / 60);
            const currSec = Math.floor(curr % 60);
            const durMin = Math.floor(dur / 60);
            const durSec = Math.floor(dur % 60);
            const formatted = `${String(currMin).padStart(2, '0')}:${String(currSec).padStart(2, '0')} / ${String(durMin).padStart(2, '0')}:${String(durSec).padStart(2, '0')}`;
            if (text) text.textContent = formatted;
        }
    };

    const checkAutoCompletion = (curr, dur) => {
        if (activeVideoCompleted || dur <= 0) return;

        const ratio = curr / dur;
        const genuineRatio = watchedSecondsCounter / dur;

        if ((ratio >= 0.95 || curr >= dur - 4) && (genuineRatio >= 0.75 || watchedSecondsCounter >= dur * 0.75)) {
            markCurrentVideoComplete();
        }
    };

    const markCurrentVideoComplete = async () => {
        if (!currentPlaylist || !currentPlaylist.videos[currentVideoIndex]) return;
        const video = currentPlaylist.videos[currentVideoIndex];

        if (video.completed) return;

        video.completed = true;
        video.completedAt = new Date().toISOString();
        activeVideoCompleted = true;

        showToast(`Video #${video.id} Completed Automatically!`);

        renderPlayerHeader();
        renderPlayerSidebar();

        try {
            await fetch('/mark-video-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playlistUrl: currentPlaylist.url,
                    videoId: String(video.videoId || video.id)
                })
            });
        } catch (e) {}

        syncSavedPlaylists(savedPlaylists);
        updateCommandCenter();

        const autoPlayCheck = document.getElementById('player-toggle-autoplay');
        if (autoPlayCheck && autoPlayCheck.checked) {
            setTimeout(() => {
                if (currentVideoIndex < currentPlaylist.videos.length - 1) {
                    currentVideoIndex++;
                    loadCurrentVideo();
                }
            }, 2000);
        }
    };

    const syncCurrentWatchProgress = async () => {
        if (!currentPlaylist || !currentPlaylist.videos[currentVideoIndex] || !ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;

        const video = currentPlaylist.videos[currentVideoIndex];
        const curr = ytPlayer.getCurrentTime() || 0;
        const dur = (typeof ytPlayer.getDuration === 'function') ? (ytPlayer.getDuration() || 0) : 0;

        video.lastPosition = curr;
        video.watchedSeconds = watchedSecondsCounter;
        if (dur > 0) video.duration = dur;

        try {
            const res = await fetch('/watch-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playlistUrl: currentPlaylist.url,
                    videoId: String(video.videoId || video.id),
                    lastPosition: curr,
                    watchedSeconds: watchedSecondsCounter,
                    duration: dur
                })
            });
            const data = await res.json();
            if (data.completed && !activeVideoCompleted) {
                markCurrentVideoComplete();
            }
        } catch (e) {}
    };

    // Event Wire-up for Player Controls
    const btnPlayerBack = document.getElementById('player-btn-back');
    if (btnPlayerBack) {
        btnPlayerBack.addEventListener('click', () => {
            syncCurrentWatchProgress();
            stopWatchTimers();
            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                try { ytPlayer.pauseVideo(); } catch(e){}
            }
            switchView('view-learning');
            switchLearningCard('saved');
        });
    }

    const btnPlayerPrev = document.getElementById('player-btn-prev');
    if (btnPlayerPrev) {
        btnPlayerPrev.addEventListener('click', () => {
            if (currentVideoIndex > 0) {
                syncCurrentWatchProgress();
                currentVideoIndex--;
                loadCurrentVideo();
            } else {
                showToast("You are on the first video.");
            }
        });
    }

    const btnPlayerNext = document.getElementById('player-btn-next');
    if (btnPlayerNext) {
        btnPlayerNext.addEventListener('click', () => {
            if (currentPlaylist && currentPlaylist.videos && currentVideoIndex < currentPlaylist.videos.length - 1) {
                syncCurrentWatchProgress();
                currentVideoIndex++;
                loadCurrentVideo();
            } else {
                showToast("You have reached the end of the playlist!");
            }
        });
    }

    const btnResumeAction = document.getElementById('player-btn-resume');
    if (btnResumeAction) {
        btnResumeAction.addEventListener('click', () => {
            const resumeOverlay = document.getElementById('player-resume-overlay');
            if (resumeOverlay) resumeOverlay.style.display = 'none';

            if (currentPlaylist && currentPlaylist.videos[currentVideoIndex]) {
                const pos = currentPlaylist.videos[currentVideoIndex].lastPosition || 0;
                if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
                    try {
                        ytPlayer.seekTo(pos, true);
                        ytPlayer.playVideo();
                    } catch(e){}
                }
            }
        });
    }

    const btnRestartAction = document.getElementById('player-btn-restart');
    if (btnRestartAction) {
        btnRestartAction.addEventListener('click', () => {
            const resumeOverlay = document.getElementById('player-resume-overlay');
            if (resumeOverlay) resumeOverlay.style.display = 'none';

            if (currentPlaylist && currentPlaylist.videos[currentVideoIndex]) {
                currentPlaylist.videos[currentVideoIndex].lastPosition = 0;
                currentPlaylist.videos[currentVideoIndex].watchedSeconds = 0;
                watchedSecondsCounter = 0;
                if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
                    try {
                        ytPlayer.seekTo(0, true);
                        ytPlayer.playVideo();
                    } catch(e){}
                }
            }
        });
    }

    // ── ACTIVE ROADMAP TRACKING SYSTEM ──
    const initActiveRoadmap = async () => {
        try {
            const res = await fetch('/get-active-roadmap');
            if (res.ok) {
                const data = await res.json();
                if (data && data.skill && data.steps) {
                    activeRoadmap = data;
                } else {
                    activeRoadmap = null;
                }
            }
        } catch (e) {
            console.error("Failed to fetch active roadmap:", e);
        }
        renderDashboardRoadmap();
    };

    const renderDashboardRoadmap = () => {
        const cardEmpty = document.getElementById('dashboard-active-roadmap-empty');
        const cardContent = document.getElementById('dashboard-active-roadmap-content');
        const metaHeader = document.getElementById('dashboard-active-roadmap-header-meta');
        const skillBadge = document.getElementById('dashboard-active-roadmap-skill');
        const progressText = document.getElementById('dashboard-roadmap-progress-text');
        const pctBadge = document.getElementById('dashboard-roadmap-pct-badge');
        const progressBar = document.getElementById('dashboard-roadmap-progress-bar');
        const checklist = document.getElementById('dashboard-roadmap-checklist');

        if (!activeRoadmap) {
            if (metaHeader) metaHeader.style.display = 'none';
            if (cardContent) cardContent.style.display = 'none';
            if (cardEmpty) cardEmpty.style.display = 'flex';
            return;
        }

        // Show active elements
        if (cardEmpty) cardEmpty.style.display = 'none';
        if (metaHeader) metaHeader.style.display = 'flex';
        if (cardContent) cardContent.style.display = 'flex';

        // Update titles
        if (skillBadge) {
            skillBadge.textContent = `${activeRoadmap.skill} (${activeRoadmap.level || 'Beginner'})`;
        }

        // Calculate progress
        const total = activeRoadmap.steps.length;
        const completed = activeRoadmap.steps.filter(s => s.completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        if (progressText) {
            progressText.textContent = `Progress: ${pct}% (${completed} / ${total} steps completed)`;
        }
        if (pctBadge) {
            pctBadge.textContent = `${pct}%`;
        }
        if (progressBar) {
            progressBar.style.width = `${pct}%`;
        }

        // Render steps grouped by phase
        if (checklist) {
            checklist.innerHTML = '';
            const phases = [
                { key: 'beginner', label: 'Beginner Phase' },
                { key: 'intermediate', label: 'Intermediate Phase' },
                { key: 'advanced', label: 'Advanced Phase' },
                { key: 'projects', label: 'Projects to Build' },
                { key: 'certifications', label: 'Recommended Certifications' },
                { key: 'interview_prep', label: 'Interview Prep Focus' }
            ];

            phases.forEach(phase => {
                const phaseSteps = activeRoadmap.steps.filter(s => s.phaseKey === phase.key);
                if (phaseSteps.length > 0) {
                    // Render Phase Header
                    const header = document.createElement('div');
                    header.className = 'roadmap-phase-title-group';
                    header.innerHTML = `<span>${phase.label}</span>`;
                    checklist.appendChild(header);

                    // Render Phase Steps
                    phaseSteps.forEach(step => {
                        const stepEl = document.createElement('div');
                        stepEl.className = `roadmap-step-item ${step.completed ? 'completed' : ''}`;
                        
                        const isProject = phase.key === 'projects';
                        const descHtml = isProject && step.description ? `<span class="roadmap-step-desc">${escapeHTML(step.description)}</span>` : '';

                        stepEl.innerHTML = `
                            <input type="checkbox" class="roadmap-checkbox" data-step-id="${step.id}" ${step.completed ? 'checked' : ''}>
                            <div class="roadmap-step-text-wrap">
                                <span class="roadmap-step-title">${escapeHTML(step.title)}</span>
                                ${descHtml}
                            </div>
                        `;

                        // Checkbox event listener
                        stepEl.querySelector('.roadmap-checkbox').addEventListener('change', (e) => {
                            toggleRoadmapStep(step.id, e.target.checked);
                        });

                        checklist.appendChild(stepEl);
                    });
                }
            });
        }
    };

    const toggleRoadmapStep = async (stepId, isChecked) => {
        if (!activeRoadmap) return;
        activeRoadmap.steps = activeRoadmap.steps.map(s => {
            if (s.id === stepId) {
                s.completed = isChecked;
            }
            return s;
        });

        // Auto-sync completed projects to Projects portfolio tab
        const toggledStep = activeRoadmap.steps.find(s => s.id === stepId);
        if (toggledStep && toggledStep.phaseKey === 'projects') {
            try {
                const res = await fetch('/get-user-projects');
                if (res.ok) {
                    const plist = await res.json();
                    if (Array.isArray(plist)) {
                        customProjects = plist;
                    }
                }
            } catch (e) {
                console.error("Failed to load custom projects on toggle:", e);
            }

            if (isChecked) {
                if (!customProjects.some(p => p.title === toggledStep.title)) {
                    customProjects.push({
                        title: toggledStep.title,
                        category: activeRoadmap.skill + " Roadmap",
                        desc: toggledStep.description || `Auto-logged: Completed from the ${activeRoadmap.skill} roadmap.`
                    });
                }
            } else {
                customProjects = customProjects.filter(p => p.title !== toggledStep.title);
            }
            await syncProjects();
        }

        // Compute new percentage
        const total = activeRoadmap.steps.length;
        const completed = activeRoadmap.steps.filter(s => s.completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Render dashboard card
        renderDashboardRoadmap();

        // Render Learning tab if it's currently showing the same roadmap
        if (currentResults && currentResults.roadmap && 
            currentResults.skill === activeRoadmap.skill && 
            (currentResults.level || 'Beginner') === activeRoadmap.level) {
            renderActiveRoadmapChecklistInLearning();
        }

        // Sync with backend
        try {
            await fetch('/sync-active-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill: activeRoadmap.skill,
                    level: activeRoadmap.level,
                    steps: activeRoadmap.steps,
                    completion_pct: pct
                })
            });

            // If checked to 100% completion, automatically log milestone achievement
            if (pct === 100) {
                const milestoneDetail = `Completed ${activeRoadmap.skill} (${activeRoadmap.level}) roadmap!`;
                await fetch('/add-milestone', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        skill_name: activeRoadmap.skill,
                        outcome_type: 'roadmap_complete',
                        outcome_detail: milestoneDetail
                    })
                });
                // Reload milestones to update Profile & Analytics lists
                initProfileMilestones();
            }
        } catch (e) {
            console.error("Failed to sync active roadmap step or milestone:", e);
        }
    };

    const renderActiveRoadmapChecklistInLearning = () => {
        renderStep('roadmap');
    };

    // Milestones tracking
    const initProfileMilestones = async () => {
        try {
            const res = await fetch('/get-milestones');
            if (res.ok) {
                const list = await res.json();
                renderMilestones(list);
            }
        } catch (e) {
            console.error("Failed to load milestones:", e);
        }
    };

    const renderMilestones = (list) => {
        const profileList = document.getElementById('profile-milestones-list');
        const analyticsList = document.getElementById('analytics-milestones-list');
        
        const html = list.length > 0 ? list.map(m => `
            <div style="background:var(--bg-main); border:1px solid var(--border); padding:14px 18px; border-radius:var(--radius-md); display:flex; align-items:center; gap:14px;">
                <span style="display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg></span>
                <div style="display:flex; flex-direction:column; gap:3px;">
                    <strong style="color:var(--text-main); font-size:0.925rem; line-height:1.3;">${escapeHTML(m.outcome_detail || m.skill_name)}</strong>
                     <span style="color:var(--text-muted); font-size:0.75rem;">Earned ${new Date(m.created_at).toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'})}</span>
                </div>
            </div>
        `).join('') : `
            <p class="empty-state" style="margin:0; padding:10px 0; font-size:0.85rem;">No milestone achievements earned yet. Complete an active roadmap to 100% to earn your first badge!</p>
        `;

        if (profileList) {
            profileList.innerHTML = html;
        }
        
        const analyticsHtml = list.length > 0 ? list.map(m => `
            <div style="background:var(--bg-card); border:1px solid var(--border); padding:16px 20px; border-radius:var(--radius-lg); display:flex; align-items:center; gap:16px; box-shadow:var(--shadow-card); margin-bottom:12px;">
                <div style="background:rgba(37,99,235,0.08); width:52px; height:52px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg></div>
                <div style="display:flex; flex-direction:column; gap:4px; flex-grow:1;">
                    <strong style="color:var(--text-main); font-size:1rem; font-family:'Outfit',sans-serif;">${escapeHTML(m.outcome_detail || m.skill_name)}</strong>
                    <span style="color:var(--text-muted); font-size:0.8rem;">Career Milestone Achievement • Completed on ${new Date(m.created_at).toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'})}</span>
                </div>
            </div>
        `).join('') : `
            <p class="empty-state" style="margin:0; padding:16px 0; font-size:0.85rem;">No completed milestones recorded yet. Finish active roadmaps to list achievements here!</p>
        `;

        if (analyticsList) {
            analyticsList.innerHTML = analyticsHtml;
        }
    };

    const trackRoadmapFlow = async () => {
        if (!currentResults || !currentResults.roadmap) return;
        
        // Confirmation dialog if already tracking something else
        if (activeRoadmap && (activeRoadmap.skill !== currentResults.skill || activeRoadmap.level !== (currentResults.level || 'Beginner'))) {
            const ok = confirm(`You are already tracking an active roadmap for "${activeRoadmap.skill} (${activeRoadmap.level || 'Beginner'})". Tracking this new one will overwrite your current progress. Do you want to proceed?`);
            if (!ok) return;
        }

        // Convert the hierarchical JSON into flat steps
        const rm = currentResults.roadmap;
        const steps = [];
        let idCounter = 1;

        if (Array.isArray(rm.beginner)) {
            rm.beginner.forEach(topic => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'beginner', title: topic, completed: false });
            });
        }
        if (Array.isArray(rm.intermediate)) {
            rm.intermediate.forEach(topic => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'intermediate', title: topic, completed: false });
            });
        }
        if (Array.isArray(rm.advanced)) {
            rm.advanced.forEach(topic => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'advanced', title: topic, completed: false });
            });
        }
        if (Array.isArray(rm.projects)) {
            rm.projects.forEach(p => {
                steps.push({ 
                    id: `step_${idCounter++}`, 
                    phaseKey: 'projects', 
                    title: p.name || p.title || 'Project', 
                    description: p.description || '', 
                    completed: false 
                });
            });
        }
        if (Array.isArray(rm.certifications)) {
            rm.certifications.forEach(cert => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'certifications', title: cert, completed: false });
            });
        }
        if (Array.isArray(rm.interview_prep)) {
            rm.interview_prep.forEach(prep => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'interview_prep', title: prep, completed: false });
            });
        }

        activeRoadmap = {
            skill: currentResults.skill,
            level: currentResults.level || 'Beginner',
            steps: steps
        };

        // Render dashboard card
        renderDashboardRoadmap();

        // Render in learning tab
        renderStep('roadmap');

        // Sync with backend
        try {
            await fetch('/sync-active-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill: activeRoadmap.skill,
                    level: activeRoadmap.level,
                    steps: activeRoadmap.steps,
                    completion_pct: 0.0
                })
            });
        } catch (e) {
            console.error("Failed to sync tracked roadmap:", e);
        }
    };

    const untrackRoadmapFlow = async () => {
        if (!activeRoadmap) return;
        const ok = confirm(`Are you sure you want to stop tracking the roadmap for "${activeRoadmap.skill} (${activeRoadmap.level || 'Beginner'})"? Your progress will be permanently lost.`);
        if (!ok) return;

        activeRoadmap = null;
        renderDashboardRoadmap();

        // Update Learning tab if it was rendering the tracked roadmap
        renderStep('roadmap');

        try {
            await fetch('/sync-active-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(null)
            });
        } catch (e) {
            console.error("Failed to untrack active roadmap:", e);
        }
    };

    // Silent click tracker
    const trackClick = (url, title, action = 'click') => {
        if (!url || url === '#') return;
        fetch('/track-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resource_url: url,
                resource_title: title,
                skill_name: currentSkill,
                action,
                session_id: sessionId
            })
        }).catch(() => {});
    };

    /**
     * Handle Search
     */
    const handleSearch = async () => {
        const skill = skillInput.value.trim();
        const level = levelDropdown.value;
        const language = languageDropdown.value;

        if (!skill) {
            showToast('Please enter a skill to learn.');
            return;
        }

        // Reset UI
        setLoading(true);
        resetViews();
        emptyState.innerHTML = `<p>Enter a skill above to generate your learning path.</p>`;

        try {
            const response = await fetch('/get-resource', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skill, level, language })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to fetch resources.');
            }

            const data = await response.json();
            currentResults = data;

            currentSkill = skill;

            const hasPlaylists = data.fallback_playlists && data.fallback_playlists.length > 0;
            const hasCerts = data.fallback_certs && data.fallback_certs.length > 0;
            const hasRecommendations = data.recommendations;

            if (!hasPlaylists && !hasCerts && !hasRecommendations) {
                setLoading(false);
                emptyState.style.display = 'block';
                return;
            }

            // Tier label badge
            if (tierLabelBadge) tierLabelBadge.textContent = data.tier_label || '';

            if (data.tier === 0) {
                tierIndicator.textContent = 'Instant Result: Retrieved from AI Memory';
            } else if (data.tier === 1) {
                tierIndicator.textContent = 'Curated Result: Trusted CSV Dataset';
            } else if (data.tier >= 3) {
                tierIndicator.textContent = 'AI-Ranked Result: Groq Intelligence Engine';
            } else {
                tierIndicator.textContent = 'The best free curated playlists to build your foundation.';
            }

            if (data.roadmap) {
                tabRoadmap.style.display = 'inline-block';
            } else {
                tabRoadmap.style.display = 'none';
            }

            // Show Navigation and Step 1
            resultsNav.style.display = 'flex';
            renderStep('playlists');

            // Save to Supabase (fire and forget)
            if (window.db && window.db.saveSearch) {
                window.db.saveSearch(skill, level, language);
            }

        } catch (error) {
            if (error.message.includes("No verified high-quality")) {
                emptyState.innerHTML = `<p style="color: var(--danger); font-size: 1.1rem; font-weight: 500;">${escapeHTML(error.message)}</p>`;
            } else {
                showToast(error.message);
            }
            emptyState.style.display = 'block';
        } finally {
            setLoading(false);
        }
    };

    const renderAIMentorCard = (category, data) => {
        const card = document.createElement('div');
        card.className = 'resource-card show';
        const vStatus = data.verification_status ? `<span class="pill-badge" style="background: #059669; color: white; margin-left: auto;">${escapeHTML(data.verification_status)}</span>` : '';
        
        const savedList = getSavedPlaylists();
        const isSaved = savedList.some(p => p.url === data.url);
        const saveBtnLabel = isSaved ? 'Saved' : 'Save';
        const saveBtnClass = isSaved ? 'btn-save-playlist saved' : 'btn-save-playlist';

        const isCert = !data.url.includes('youtube.com');
        const btnLabel = isCert ? 'Join Course' : 'Watch Playlist';

        const actionButtonsHtml = isCert ? `
            <a href="${data.url}" target="_blank" class="btn-watch" rel="noopener noreferrer"
               style="grid-column: span 2; text-align: center; background: var(--primary); border-color: transparent;"
               onclick="trackClickGlobal('${data.url.replace(/'/g,"\\'")}',' ${escapeHTML(data.title).replace(/'/g,"\\'")}')">${btnLabel}</a>
        ` : `
            <a href="${data.url}" target="_blank" class="btn-watch" rel="noopener noreferrer"
               style="background: var(--primary); border-color: transparent;"
               onclick="trackClickGlobal('${data.url.replace(/'/g,"\\'")}',' ${escapeHTML(data.title).replace(/'/g,"\\'")}')">${btnLabel}</a>
            <button class="${saveBtnClass}" data-url="${escapeHTML(data.url)}">
                ${saveBtnLabel}
            </button>
        `;

        card.innerHTML = `
            <div class="card-header" style="flex-wrap: wrap;">
                <span class="pill-badge" style="background: var(--primary); color: white;">${escapeHTML(category.toUpperCase())}</span>
                <span class="pill-badge">Trust: ${data.trust_score || 90}/100</span>
                ${vStatus}
            </div>
            <h3 class="card-title">${escapeHTML(data.title)}</h3>
            <span class="channel-name">${escapeHTML(data.channel)}</span>
            <p class="card-desc" style="margin-top: 10px;"><strong>Why:</strong> ${escapeHTML(data.why_selected)}</p>
            <p class="card-desc"><strong>Time:</strong> ${escapeHTML(data.estimated_time)} | <strong>Outcome:</strong> ${escapeHTML(data.expected_outcome)}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: auto;">
                ${actionButtonsHtml}
            </div>
        `;

        const saveBtn = card.querySelector('.btn-save-playlist');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePlaylistSave({
                    title: data.title,
                    channel: data.channel,
                    url: data.url,
                    duration: data.estimated_time || 'Full',
                    level: 'All',
                    skill: category
                }, saveBtn);
            });
        }

        return card;
    };

    /**
     * Render a specific view step
     */
    const renderStep = (step) => {
        // Reset all
        playlistStep.classList.remove('active');
        certificateStep.classList.remove('active');
        roadmapStep.classList.remove('active');
        tabPlaylists.classList.remove('active');
        tabCertificates.classList.remove('active');
        tabRoadmap.classList.remove('active');

        if (step === 'playlists') {
            playlistGrid.innerHTML = '';
            aiRecommendationsGrid.innerHTML = '';
            playlistStep.classList.add('active');
            tabPlaylists.classList.add('active');
            
            if (currentResults.recommendations) {
                aiRecommendations.style.display = 'block';
                Object.entries(currentResults.recommendations).forEach(([category, data], index) => {
                    if(data && data.url) {
                        const card = renderAIMentorCard(category.replace('_', ' '), data);
                        aiRecommendationsGrid.appendChild(card);
                    }
                });
            } else {
                aiRecommendations.style.display = 'none';
            }

            if (currentResults.fallback_playlists) {
                currentResults.fallback_playlists.forEach((item, index) => {
                    const card = createCard(item, index);
                    playlistGrid.appendChild(card);
                    setTimeout(() => card.classList.add('show'), (index + 2) * 100);
                });
            }
        } 
        else if (step === 'certificates') {
            certificateGrid.innerHTML = '';
            certificateStep.classList.add('active');
            tabCertificates.classList.add('active');

            if (currentResults.fallback_certs) {
                currentResults.fallback_certs.forEach((item, index) => {
                    const card = createCard(item, index);
                    certificateGrid.appendChild(card);
                    setTimeout(() => card.classList.add('show'), index * 100);
                });
            }
        }
        else if (step === 'roadmap') {
            roadmapContent.innerHTML = '';
            roadmapStep.classList.add('active');
            tabRoadmap.classList.add('active');

            const rm = currentResults.roadmap;
            if (rm) {
                const isCurrentlyTracked = activeRoadmap && 
                                           activeRoadmap.skill === currentResults.skill && 
                                           activeRoadmap.level === (currentResults.level || 'Beginner');

                // Add Tracking Status / Action Button at the top
                const trackingBtnContainer = document.createElement('div');
                trackingBtnContainer.style.marginBottom = '24px';
                
                if (isCurrentlyTracked) {
                    trackingBtnContainer.innerHTML = `
                        <div style="display:flex; gap:12px; align-items:center;">
                            <button id="btn-track-this-roadmap" class="btn-outline-primary" style="flex:1; background:rgba(37,99,235,0.05); color:var(--primary); border-color:var(--primary); font-weight:700; pointer-events:none; cursor:default; height:44px; display:flex; align-items:center; justify-content:center; gap:8px; border-radius:var(--radius-md);">
                                <span>✓ Currently Tracking Progress</span>
                            </button>
                            <button id="btn-learning-untrack" class="btn-outline-danger" style="color:var(--danger); border-color:var(--danger); height:44px; padding:0 16px; border-radius:var(--radius-md); font-weight:600; cursor:pointer; background:transparent; display:flex; align-items:center; justify-content:center; transition: all 0.2s;">
                                Stop Tracking
                            </button>
                        </div>
                    `;
                } else {
                    trackingBtnContainer.innerHTML = `
                        <button id="btn-track-this-roadmap" class="btn-primary" style="width:100%; height:44px; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:0.9rem; border-radius:var(--radius-md);">
                            Track this Learning Roadmap
                        </button>
                    `;
                }
                roadmapContent.appendChild(trackingBtnContainer);

                // Add button click listeners
                const trackBtn = trackingBtnContainer.querySelector('#btn-track-this-roadmap');
                if (trackBtn && !isCurrentlyTracked) {
                    trackBtn.addEventListener('click', trackRoadmapFlow);
                }
                const untrackBtn = trackingBtnContainer.querySelector('#btn-learning-untrack');
                if (untrackBtn) {
                    untrackBtn.addEventListener('click', untrackRoadmapFlow);
                }

                // Render Checklist (interactive if tracked, styled static preview if not)
                const checklistContainer = document.createElement('div');
                checklistContainer.style.display = 'flex';
                checklistContainer.style.flexDirection = 'column';
                checklistContainer.style.gap = '20px';
                roadmapContent.appendChild(checklistContainer);

                const phases = [
                    { key: 'beginner', label: 'Beginner Phase' },
                    { key: 'intermediate', label: 'Intermediate Phase' },
                    { key: 'advanced', label: 'Advanced Phase' },
                    { key: 'projects', label: 'Projects to Build' },
                    { key: 'certifications', label: 'Recommended Certifications' },
                    { key: 'interview_prep', label: 'Interview Prep Focus' }
                ];

                phases.forEach(phase => {
                    let items = [];
                    if (isCurrentlyTracked) {
                        items = activeRoadmap.steps.filter(s => s.phaseKey === phase.key);
                    } else {
                        // Static preview mapping from raw JSON
                        const rawItems = rm[phase.key] || [];
                        let idx = 1;
                        items = rawItems.map(item => {
                            if (phase.key === 'projects') {
                                return {
                                    id: `preview_${phase.key}_${idx++}`,
                                    title: item.name || item.title || 'Project',
                                    description: item.description || '',
                                    completed: false
                                };
                            } else {
                                return {
                                    id: `preview_${phase.key}_${idx++}`,
                                    title: item,
                                    completed: false
                                };
                            }
                        });
                    }

                    if (items.length > 0) {
                        const phaseSection = document.createElement('div');
                        phaseSection.className = 'roadmap-section';
                        phaseSection.style.marginBottom = '10px';
                        phaseSection.innerHTML = `
                            <h3 style="font-family:'Outfit',sans-serif; margin-bottom:12px; font-size:1.05rem;">${phase.label}</h3>
                            <div class="phase-steps-list" style="display:flex; flex-direction:column; gap:10px;"></div>
                        `;
                        const listWrap = phaseSection.querySelector('.phase-steps-list');

                        items.forEach(step => {
                            const stepEl = document.createElement('div');
                            stepEl.className = `roadmap-step-item ${step.completed ? 'completed' : ''}`;
                            
                            const isProject = phase.key === 'projects';
                            const descHtml = isProject && step.description ? `<span class="roadmap-step-desc">${escapeHTML(step.description)}</span>` : '';
                            
                            if (isCurrentlyTracked) {
                                stepEl.innerHTML = `
                                    <input type="checkbox" class="roadmap-checkbox" data-step-id="${step.id}" ${step.completed ? 'checked' : ''}>
                                    <div class="roadmap-step-text-wrap">
                                        <span class="roadmap-step-title">${escapeHTML(step.title)}</span>
                                        ${descHtml}
                                    </div>
                                `;
                                stepEl.querySelector('.roadmap-checkbox').addEventListener('change', (e) => {
                                    toggleRoadmapStep(step.id, e.target.checked);
                                });
                            } else {
                                stepEl.innerHTML = `
                                    <input type="checkbox" class="roadmap-checkbox" disabled style="opacity: 0.6; cursor: not-allowed;">
                                    <div class="roadmap-step-text-wrap">
                                        <span class="roadmap-step-title" style="color:var(--text-sub);">${escapeHTML(step.title)}</span>
                                        ${descHtml}
                                    </div>
                                `;
                            }
                            listWrap.appendChild(stepEl);
                        });

                        checklistContainer.appendChild(phaseSection);
                    }
                });
            }
        }
    };

    /**
     * Card Factory
     */
    const createCard = (data, index) => {
        const card = document.createElement('div');
        card.className = 'resource-card';
        
        const title = data.title || 'Untitled';
        const channel = data.channel || 'Author';
        const duration = data.duration_hours ? `${data.duration_hours}h` : 'Full';
        const level = data.level || 'Beginner';
        const desc = data.description || 'Curated high-quality learning resource.';
        const url = data.url || '#';
        const rank = data.rank || (index + 1);

        const isCert = !url.includes('youtube.com');
        const btnLabel = isCert ? 'Join Course' : 'Watch Playlist';

        const vBadge = data.verification_status ? `<span class="pill-badge" style="background: #059669; color: white;">${escapeHTML(data.verification_status)}</span>` : '';
        
        const savedList = getSavedPlaylists();
        const isSaved = savedList.some(p => p.url === url);
        const saveBtnLabel = isSaved ? 'Saved' : 'Save';
        const saveBtnClass = isSaved ? 'btn-save-playlist saved' : 'btn-save-playlist';

        const actionButtonsHtml = isCert ? `
            <a href="${url}" target="_blank" class="btn-watch" rel="noopener noreferrer" style="grid-column: span 2; text-align: center;">
                ${btnLabel}
            </a>
        ` : `
            <a href="${url}" target="_blank" class="btn-watch" rel="noopener noreferrer">
                ${btnLabel}
            </a>
            <button class="${saveBtnClass}" data-url="${escapeHTML(url)}">
                ${saveBtnLabel}
            </button>
        `;

        card.innerHTML = `
            <div class="card-header" style="flex-wrap: wrap;">
                <span class="rank-badge">#${rank}</span>
                <div class="card-badges" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span class="pill-badge">${escapeHTML(level)}</span>
                    <span class="pill-badge">${escapeHTML(duration)}</span>
                    ${vBadge}
                </div>
            </div>
            <h3 class="card-title">${escapeHTML(title)}</h3>
            <span class="channel-name">${escapeHTML(channel)}</span>
            <p class="card-desc">${escapeHTML(desc)}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: auto;">
                ${actionButtonsHtml}
            </div>
        `;
        
        const watchBtn = card.querySelector('.btn-watch');
        if (watchBtn) {
            watchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isCert) {
                    openLearningPlayer(url, 0);
                } else {
                    safeOpenUrl(url);
                }
            });
        }

        const saveBtn = card.querySelector('.btn-save-playlist');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePlaylistSave({
                    title,
                    channel,
                    url,
                    duration,
                    level,
                    skill: currentSkill || level
                }, saveBtn);
            });
        }

        return card;
    };

    // UI Helpers
    const resetViews = () => {
        resultsNav.style.display = 'none';
        playlistStep.classList.remove('active');
        certificateStep.classList.remove('active');
        roadmapStep.classList.remove('active');
        emptyState.style.display = 'none';
        playlistGrid.innerHTML = '';
        certificateGrid.innerHTML = '';
        aiRecommendationsGrid.innerHTML = '';
        roadmapContent.innerHTML = '';
    };

    const setLoading = (isLoading) => {
        loadingIndicator.style.display = isLoading ? 'block' : 'none';
        ctaButton.disabled = isLoading;
        ctaButton.textContent = isLoading ? 'Curating...' : 'Find Resources';
    };

    const showToast = (message) => {
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
    };

    const escapeHTML = (str) => {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };

    /**
     * Interview Prep Logic
     */
    const interviewCategories = document.getElementById('interview-categories');
    
    // DSA Sub-View
    const dsaPrepContent = document.getElementById('dsa-prep-content');
    const btnDsaCategory = document.getElementById('btn-dsa-category');
    const backToCategoriesDsa = document.getElementById('back-to-categories-dsa');
    const companySearchInput = document.getElementById('company-search');
    const companiesGrid = document.getElementById('companies-grid');
    const questionsView = document.getElementById('questions-view');
    const companySelection = document.getElementById('company-selection');
    const backToCompanies = document.getElementById('back-to-companies');
    const questionsGrid = document.getElementById('questions-grid');
    const selectedCompanyTitle = document.getElementById('selected-company-title');

    // Resume Sub-View
    const resumeAnalyzerContent = document.getElementById('resume-analyzer-content');
    const btnResumeCategory = document.getElementById('btn-resume-category');
    const backToCategoriesResume = document.getElementById('back-to-categories-resume');
    const resumeUpload = document.getElementById('resume-upload');
    const btnTriggerUpload = document.getElementById('btn-trigger-upload');
    const uploadZone = document.getElementById('upload-zone');
    const analysisStatus = document.getElementById('analysis-status');
    const analysisResults = document.getElementById('analysis-results');
    const statusText = document.getElementById('status-text');

    let allCompanies = [];

    const showSelectionScreen = () => {
        if (interviewCategories) interviewCategories.style.display = 'grid';
        if (dsaPrepContent) dsaPrepContent.style.display = 'none';
        if (resumeAnalyzerContent) resumeAnalyzerContent.style.display = 'none';
    };

    const cardModeBeginners = document.getElementById('card-mode-beginners');
    const cardModeCompanywise = document.getElementById('card-mode-companywise');
    const workspaceBeginners = document.getElementById('workspace-beginners');
    const workspaceCompanywise = document.getElementById('workspace-companywise');
    const beginnerQuestionsGrid = document.getElementById('beginner-questions-grid');

    const beginnerQuestionsData = [
        // Two Pointers
        { id: "26", title: "Remove Duplicates from Sorted Array", url: "https://leetcode.com/problems/remove-duplicates-from-sorted-array/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "27", title: "Remove Element", url: "https://leetcode.com/problems/remove-element/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "88", title: "Merge Sorted Array", url: "https://leetcode.com/problems/merge-sorted-array/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "283", title: "Move Zeroes", url: "https://leetcode.com/problems/move-zeroes/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "349", title: "Intersection of Two Arrays", url: "https://leetcode.com/problems/intersection-of-two-arrays/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers + Sorting" },
        { id: "350", title: "Intersection of Two Arrays II", url: "https://leetcode.com/problems/intersection-of-two-arrays-ii/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers + Sorting" },
        { id: "455", title: "Assign Cookies", url: "https://leetcode.com/problems/assign-cookies/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers + Greedy" },
        { id: "905", title: "Sort Array By Parity", url: "https://leetcode.com/problems/sort-array-by-parity/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "922", title: "Sort Array By Parity II", url: "https://leetcode.com/problems/sort-array-by-parity-ii/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "977", title: "Squares of a Sorted Array", url: "https://leetcode.com/problems/squares-of-a-sorted-array/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "2460", title: "Apply Operations to an Array", url: "https://leetcode.com/problems/apply-operations-to-an-array/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "11", title: "Container With Most Water", url: "https://leetcode.com/problems/container-with-most-water/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "15", title: "3Sum", url: "https://leetcode.com/problems/3sum/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers + Sorting" },
        { id: "16", title: "3Sum Closest", url: "https://leetcode.com/problems/3sum-closest/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers + Sorting" },
        { id: "18", title: "4Sum", url: "https://leetcode.com/problems/4sum/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers + Sorting" },
        { id: "80", title: "Remove Duplicates from Sorted Array II", url: "https://leetcode.com/problems/remove-duplicates-from-sorted-array-ii/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "167", title: "Two Sum II – Input Array Is Sorted", url: "https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "189", title: "Rotate Array", url: "https://leetcode.com/problems/rotate-array/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "611", title: "Valid Triangle Number", url: "https://leetcode.com/problems/valid-triangle-number/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "881", title: "Boats to Save People", url: "https://leetcode.com/problems/boats-to-save-people/", difficulty: "Medium", topic: "Two Pointers", pattern: "Two Pointers" },
        { id: "42", title: "Trapping Rain Water", url: "https://leetcode.com/problems/trapping-rain-water/", difficulty: "Hard", topic: "Two Pointers", pattern: "Two Pointers" },

        // Arrays
        { id: "1", title: "Two Sum", url: "https://leetcode.com/problems/two-sum/", difficulty: "Easy", topic: "Arrays", pattern: "Hash Map Lookup" },
        { id: "217", title: "Contains Duplicate", url: "https://leetcode.com/problems/contains-duplicate/", difficulty: "Easy", topic: "Arrays", pattern: "Frequency Map" },
        { id: "242", title: "Valid Anagram", url: "https://leetcode.com/problems/valid-anagram/", difficulty: "Easy", topic: "Arrays", pattern: "Frequency Map" },
        { id: "121", title: "Best Time to Buy and Sell Stock", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/", difficulty: "Easy", topic: "Arrays", pattern: "Sliding Window" },
        { id: "169", title: "Majority Element", url: "https://leetcode.com/problems/majority-element/", difficulty: "Easy", topic: "Arrays", pattern: "Boyer-Moore Voting" },
        { id: "268", title: "Missing Number", url: "https://leetcode.com/problems/missing-number/", difficulty: "Easy", topic: "Arrays", pattern: "Bit Manipulation" },

        // Sliding Window
        { id: "643", title: "Maximum Average Subarray I", url: "https://leetcode.com/problems/maximum-average-subarray-i/", difficulty: "Easy", topic: "Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "209", title: "Minimum Size Subarray Sum", url: "https://leetcode.com/problems/minimum-size-subarray-sum/", difficulty: "Medium", topic: "Sliding Window", pattern: "Variable Sliding Window" },
        { id: "713", title: "Subarray Product Less Than K", url: "https://leetcode.com/problems/subarray-product-less-than-k/", difficulty: "Medium", topic: "Sliding Window", pattern: "Variable Sliding Window" },
        { id: "904", title: "Fruit Into Baskets", url: "https://leetcode.com/problems/fruit-into-baskets/", difficulty: "Medium", topic: "Sliding Window", pattern: "Variable Sliding Window" },
        { id: "930", title: "Binary Subarrays With Sum", url: "https://leetcode.com/problems/binary-subarrays-with-sum/", difficulty: "Medium", topic: "Sliding Window", pattern: "Sliding Window + Prefix Sum" },
        { id: "1004", title: "Max Consecutive Ones III", url: "https://leetcode.com/problems/max-consecutive-ones-iii/", difficulty: "Medium", topic: "Sliding Window", pattern: "Variable Sliding Window" },
        { id: "1052", title: "Grumpy Bookstore Owner", url: "https://leetcode.com/problems/grumpy-bookstore-owner/", difficulty: "Medium", topic: "Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "1248", title: "Count Number of Nice Subarrays", url: "https://leetcode.com/problems/count-number-of-nice-subarrays/", difficulty: "Medium", topic: "Sliding Window", pattern: "Sliding Window + Prefix Sum" },
        { id: "1343", title: "Number of Sub-arrays of Size K and Average Greater than or Equal to Threshold", url: "https://leetcode.com/problems/number-of-sub-arrays-of-size-k-and-average-greater-than-or-equal-to-threshold/", difficulty: "Medium", topic: "Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "1423", title: "Maximum Points You Can Obtain from Cards", url: "https://leetcode.com/problems/maximum-points-you-can-obtain-from-cards/", difficulty: "Medium", topic: "Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "1493", title: "Longest Subarray of 1's After Deleting One Element", url: "https://leetcode.com/problems/longest-subarray-of-1s-after-deleting-one-element/", difficulty: "Medium", topic: "Sliding Window", pattern: "Variable Sliding Window" },
        { id: "1658", title: "Minimum Operations to Reduce X to Zero", url: "https://leetcode.com/problems/minimum-operations-to-reduce-x-to-zero/", difficulty: "Medium", topic: "Sliding Window", pattern: "Sliding Window" },
        { id: "1695", title: "Maximum Erasure Value", url: "https://leetcode.com/problems/maximum-erasure-value/", difficulty: "Medium", topic: "Sliding Window", pattern: "Sliding Window + Hash Set" },
        { id: "1838", title: "Frequency of the Most Frequent Element", url: "https://leetcode.com/problems/frequency-of-the-most-frequent-element/", difficulty: "Medium", topic: "Sliding Window", pattern: "Sliding Window + Sorting" },
        { id: "2024", title: "Maximize the Confusion of an Exam", url: "https://leetcode.com/problems/maximize-the-confusion-of-an-exam/", difficulty: "Medium", topic: "Sliding Window", pattern: "Variable Sliding Window" },
        { id: "2958", title: "Length of Longest Subarray With at Most K Frequency", url: "https://leetcode.com/problems/length-of-longest-subarray-with-at-most-k-frequency/", difficulty: "Medium", topic: "Sliding Window", pattern: "Sliding Window + Hash Map" },
        { id: "992", title: "Subarrays with K Different Integers", url: "https://leetcode.com/problems/subarrays-with-k-different-integers/", difficulty: "Hard", topic: "Sliding Window", pattern: "Variable Sliding Window" },

        // Prefix Sum
        { id: "1480", title: "Running Sum of 1d Array", url: "https://leetcode.com/problems/running-sum-of-1d-array/", difficulty: "Easy", topic: "Prefix Sum", pattern: "Prefix Sum" },
        { id: "724", title: "Find Pivot Index", url: "https://leetcode.com/problems/find-pivot-index/", difficulty: "Easy", topic: "Prefix Sum", pattern: "Prefix Sum" },
        { id: "303", title: "Range Sum Query – Immutable", url: "https://leetcode.com/problems/range-sum-query-immutable/", difficulty: "Easy", topic: "Prefix Sum", pattern: "Prefix Sum" },
        { id: "1732", title: "Find the Highest Altitude", url: "https://leetcode.com/problems/find-the-highest-altitude/", difficulty: "Easy", topic: "Prefix Sum", pattern: "Prefix Sum" },
        { id: "1991", title: "Find the Middle Index in Array", url: "https://leetcode.com/problems/find-the-middle-index-in-array/", difficulty: "Easy", topic: "Prefix Sum", pattern: "Prefix Sum" },
        { id: "238", title: "Product of Array Except Self", url: "https://leetcode.com/problems/product-of-array-except-self/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix & Suffix Product" },
        { id: "560", title: "Subarray Sum Equals K", url: "https://leetcode.com/problems/subarray-sum-equals-k/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix Sum + Hash Map" },
        { id: "525", title: "Contiguous Array", url: "https://leetcode.com/problems/contiguous-array/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix Sum + Hash Map" },
        { id: "523", title: "Continuous Subarray Sum", url: "https://leetcode.com/problems/continuous-subarray-sum/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix Sum + Hash Map" },
        { id: "930", title: "Binary Subarrays With Sum", url: "https://leetcode.com/problems/binary-subarrays-with-sum/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix Sum" },
        { id: "974", title: "Subarray Sums Divisible by K", url: "https://leetcode.com/problems/subarray-sums-divisible-by-k/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix Sum + Hash Map" },
        { id: "1248", title: "Count Number of Nice Subarrays", url: "https://leetcode.com/problems/count-number-of-nice-subarrays/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix Sum" },
        { id: "1314", title: "Matrix Block Sum", url: "https://leetcode.com/problems/matrix-block-sum/", difficulty: "Medium", topic: "Prefix Sum", pattern: "2D Prefix Sum" },
        { id: "1352", title: "Product of the Last K Numbers", url: "https://leetcode.com/problems/product-of-the-last-k-numbers/", difficulty: "Medium", topic: "Prefix Sum", pattern: "Prefix Product" },
        { id: "304", title: "Range Sum Query 2D – Immutable", url: "https://leetcode.com/problems/range-sum-query-2d-immutable/", difficulty: "Medium", topic: "Prefix Sum", pattern: "2D Prefix Sum" },
        { id: "327", title: "Count of Range Sum", url: "https://leetcode.com/problems/count-of-range-sum/", difficulty: "Hard", topic: "Prefix Sum", pattern: "Prefix Sum + Divide & Conquer" },

        // Kadane's Algorithm
        { id: "53", title: "Maximum Subarray", url: "https://leetcode.com/problems/maximum-subarray/", difficulty: "Easy", topic: "Kadane's Algorithm", pattern: "Kadane's Algorithm" },
        { id: "918", title: "Maximum Sum Circular Subarray", url: "https://leetcode.com/problems/maximum-sum-circular-subarray/", difficulty: "Medium", topic: "Kadane's Algorithm", pattern: "Kadane's Algorithm (Circular)" },
        { id: "1749", title: "Maximum Absolute Sum of Any Subarray", url: "https://leetcode.com/problems/maximum-absolute-sum-of-any-subarray/", difficulty: "Medium", topic: "Kadane's Algorithm", pattern: "Kadane's Algorithm" },
        { id: "1191", title: "K-Concatenation Maximum Sum", url: "https://leetcode.com/problems/k-concatenation-maximum-sum/", difficulty: "Medium", topic: "Kadane's Algorithm", pattern: "Kadane's Algorithm" },
        { id: "2321", title: "Maximum Score Of Spliced Array", url: "https://leetcode.com/problems/maximum-score-of-spliced-array/", difficulty: "Hard", topic: "Kadane's Algorithm", pattern: "Kadane's Algorithm + Difference Array" },

        // String Two Pointers
        { id: "125", title: "Valid Palindrome", url: "https://leetcode.com/problems/valid-palindrome/", difficulty: "Easy", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "344", title: "Reverse String", url: "https://leetcode.com/problems/reverse-string/", difficulty: "Easy", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "345", title: "Reverse Vowels of a String", url: "https://leetcode.com/problems/reverse-vowels-of-a-string/", difficulty: "Easy", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "392", title: "Is Subsequence", url: "https://leetcode.com/problems/is-subsequence/", difficulty: "Easy", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "1768", title: "Merge Strings Alternately", url: "https://leetcode.com/problems/merge-strings-alternately/", difficulty: "Easy", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "28", title: "Find the Index of the First Occurrence in a String", url: "https://leetcode.com/problems/find-the-index-of-the-first-occurrence-in-a-string/", difficulty: "Easy", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "151", title: "Reverse Words in a String", url: "https://leetcode.com/problems/reverse-words-in-a-string/", difficulty: "Medium", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "443", title: "String Compression", url: "https://leetcode.com/problems/string-compression/", difficulty: "Medium", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "680", title: "Valid Palindrome II", url: "https://leetcode.com/problems/valid-palindrome-ii/", difficulty: "Medium", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "165", title: "Compare Version Numbers", url: "https://leetcode.com/problems/compare-version-numbers/", difficulty: "Medium", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "2109", title: "Adding Spaces to a String", url: "https://leetcode.com/problems/adding-spaces-to-a-string/", difficulty: "Medium", topic: "String Two Pointers", pattern: "Two Pointers" },
        { id: "408", title: "Valid Word Abbreviation", url: "https://leetcode.com/problems/valid-word-abbreviation/", difficulty: "Hard", topic: "String Two Pointers", pattern: "Two Pointers" },
        // String Sliding Window
        { id: "1456", title: "Maximum Number of Vowels in a Substring of Given Length", url: "https://leetcode.com/problems/maximum-number-of-vowels-in-a-substring-of-given-length/", difficulty: "Easy", topic: "String Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "2379", title: "Minimum Recolors to Get K Consecutive Black Blocks", url: "https://leetcode.com/problems/minimum-recolors-to-get-k-consecutive-black-blocks/", difficulty: "Easy", topic: "String Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "3090", title: "Maximum Length Substring With Two Occurrences", url: "https://leetcode.com/problems/maximum-length-substring-with-two-occurrences/", difficulty: "Easy", topic: "String Sliding Window", pattern: "Variable Sliding Window" },
        { id: "3", title: "Longest Substring Without Repeating Characters", url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/", difficulty: "Medium", topic: "String Sliding Window", pattern: "Variable Sliding Window" },
        { id: "424", title: "Longest Repeating Character Replacement", url: "https://leetcode.com/problems/longest-repeating-character-replacement/", difficulty: "Medium", topic: "String Sliding Window", pattern: "Variable Sliding Window" },
        { id: "438", title: "Find All Anagrams in a String", url: "https://leetcode.com/problems/find-all-anagrams-in-a-string/", difficulty: "Medium", topic: "String Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "567", title: "Permutation in String", url: "https://leetcode.com/problems/permutation-in-string/", difficulty: "Medium", topic: "String Sliding Window", pattern: "Fixed Sliding Window" },
        { id: "2516", title: "Take K of Each Character From Left and Right", url: "https://leetcode.com/problems/take-k-of-each-character-from-left-and-right/", difficulty: "Medium", topic: "String Sliding Window", pattern: "Sliding Window" },
        { id: "76", title: "Minimum Window Substring", url: "https://leetcode.com/problems/minimum-window-substring/", difficulty: "Hard", topic: "String Sliding Window", pattern: "Variable Sliding Window" },

        // Frequency Map
        { id: "1", title: "Two Sum", url: "https://leetcode.com/problems/two-sum/", difficulty: "Easy", topic: "Frequency Map", pattern: "Hash Map" },
        { id: "217", title: "Contains Duplicate", url: "https://leetcode.com/problems/contains-duplicate/", difficulty: "Easy", topic: "Frequency Map", pattern: "Hash Set / Frequency Map" },
        { id: "219", title: "Contains Duplicate II", url: "https://leetcode.com/problems/contains-duplicate-ii/", difficulty: "Easy", topic: "Frequency Map", pattern: "Hash Map" },
        { id: "242", title: "Valid Anagram", url: "https://leetcode.com/problems/valid-anagram/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "383", title: "Ransom Note", url: "https://leetcode.com/problems/ransom-note/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "387", title: "First Unique Character in a String", url: "https://leetcode.com/problems/first-unique-character-in-a-string/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "389", title: "Find the Difference", url: "https://leetcode.com/problems/find-the-difference/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "1207", title: "Unique Number of Occurrences", url: "https://leetcode.com/problems/unique-number-of-occurrences/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "1512", title: "Number of Good Pairs", url: "https://leetcode.com/problems/number-of-good-pairs/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "169", title: "Majority Element", url: "https://leetcode.com/problems/majority-element/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "1748", title: "Sum of Unique Elements", url: "https://leetcode.com/problems/sum-of-unique-elements/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "350", title: "Intersection of Two Arrays II", url: "https://leetcode.com/problems/intersection-of-two-arrays-ii/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "49", title: "Group Anagrams", url: "https://leetcode.com/problems/group-anagrams/", difficulty: "Medium", topic: "Frequency Map", pattern: "Frequency Map" },
        { id: "347", title: "Top K Frequent Elements", url: "https://leetcode.com/problems/top-k-frequent-elements/", difficulty: "Medium", topic: "Frequency Map", pattern: "Frequency Map + Heap" },
        { id: "451", title: "Sort Characters By Frequency", url: "https://leetcode.com/problems/sort-characters-by-frequency/", difficulty: "Medium", topic: "Frequency Map", pattern: "Frequency Map + Sorting" },
        { id: "560", title: "Subarray Sum Equals K", url: "https://leetcode.com/problems/subarray-sum-equals-k/", difficulty: "Medium", topic: "Frequency Map", pattern: "Prefix Sum + Hash Map" },
        { id: "659", title: "Split Array into Consecutive Subsequences", url: "https://leetcode.com/problems/split-array-into-consecutive-subsequences/", difficulty: "Medium", topic: "Frequency Map", pattern: "Frequency Map + Greedy" },
        { id: "692", title: "Top K Frequent Words", url: "https://leetcode.com/problems/top-k-frequent-words/", difficulty: "Medium", topic: "Frequency Map", pattern: "Frequency Map + Heap" },
        { id: "1636", title: "Sort Array by Increasing Frequency", url: "https://leetcode.com/problems/sort-array-by-increasing-frequency/", difficulty: "Easy", topic: "Frequency Map", pattern: "Frequency Map + Sorting" },

        // Prefix Sum + HashMap
        { id: "560", title: "Subarray Sum Equals K", url: "https://leetcode.com/problems/subarray-sum-equals-k/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "525", title: "Contiguous Array", url: "https://leetcode.com/problems/contiguous-array/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "523", title: "Continuous Subarray Sum", url: "https://leetcode.com/problems/continuous-subarray-sum/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "974", title: "Subarray Sums Divisible by K", url: "https://leetcode.com/problems/subarray-sums-divisible-by-k/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "930", title: "Binary Subarrays With Sum", url: "https://leetcode.com/problems/binary-subarrays-with-sum/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "1248", title: "Count Number of Nice Subarrays", url: "https://leetcode.com/problems/count-number-of-nice-subarrays/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "1590", title: "Make Sum Divisible by P", url: "https://leetcode.com/problems/make-sum-divisible-by-p/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "2845", title: "Count of Interesting Subarrays", url: "https://leetcode.com/problems/count-of-interesting-subarrays/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "325", title: "Maximum Size Subarray Sum Equals k", url: "https://leetcode.com/problems/maximum-size-subarray-sum-equals-k/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map" },
        { id: "437", title: "Path Sum III", url: "https://leetcode.com/problems/path-sum-iii/", difficulty: "Medium", topic: "Prefix Sum + HashMap", pattern: "Prefix Sum + Hash Map (Tree)" },
        
        // Classic Binary Search
        { id: "704", title: "Binary Search", url: "https://leetcode.com/problems/binary-search/", difficulty: "Easy", topic: "Classic Binary Search", pattern: "Classic Binary Search" },
        { id: "35", title: "Search Insert Position", url: "https://leetcode.com/problems/search-insert-position/", difficulty: "Easy", topic: "Classic Binary Search", pattern: "Classic Binary Search" },
        { id: "69", title: "Sqrt(x)", url: "https://leetcode.com/problems/sqrtx/", difficulty: "Easy", topic: "Classic Binary Search", pattern: "Binary Search on Answer" },
        { id: "278", title: "First Bad Version", url: "https://leetcode.com/problems/first-bad-version/", difficulty: "Easy", topic: "Classic Binary Search", pattern: "First True Binary Search" },
        { id: "374", title: "Guess Number Higher or Lower", url: "https://leetcode.com/problems/guess-number-higher-or-lower/", difficulty: "Easy", topic: "Classic Binary Search", pattern: "Classic Binary Search" },
        { id: "1539", title: "Kth Missing Positive Number", url: "https://leetcode.com/problems/kth-missing-positive-number/", difficulty: "Easy", topic: "Classic Binary Search", pattern: "Binary Search" },
        { id: "33", title: "Search in Rotated Sorted Array", url: "https://leetcode.com/problems/search-in-rotated-sorted-array/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search (Rotated Array)" },
        { id: "34", title: "Find First and Last Position of Element in Sorted Array", url: "https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Lower Bound & Upper Bound" },
        { id: "74", title: "Search a 2D Matrix", url: "https://leetcode.com/problems/search-a-2d-matrix/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search" },
        { id: "81", title: "Search in Rotated Sorted Array II", url: "https://leetcode.com/problems/search-in-rotated-sorted-array-ii/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search (Duplicates)" },
        { id: "153", title: "Find Minimum in Rotated Sorted Array", url: "https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search" },
        { id: "162", title: "Find Peak Element", url: "https://leetcode.com/problems/find-peak-element/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search" },
        { id: "540", title: "Single Element in a Sorted Array", url: "https://leetcode.com/problems/single-element-in-a-sorted-array/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search" },
        { id: "875", title: "Koko Eating Bananas", url: "https://leetcode.com/problems/koko-eating-bananas/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search on Answer" },
        { id: "1011", title: "Capacity To Ship Packages Within D Days", url: "https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search on Answer" },
        { id: "1283", title: "Find the Smallest Divisor Given a Threshold", url: "https://leetcode.com/problems/find-the-smallest-divisor-given-a-threshold/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search on Answer" },
        { id: "2226", title: "Maximum Candies Allocated to K Children", url: "https://leetcode.com/problems/maximum-candies-allocated-to-k-children/", difficulty: "Medium", topic: "Classic Binary Search", pattern: "Binary Search on Answer" },
        { id: "410", title: "Split Array Largest Sum", url: "https://leetcode.com/problems/split-array-largest-sum/", difficulty: "Hard", topic: "Classic Binary Search", pattern: "Binary Search on Answer" },

        // Lower / Upper Bound
        { id: "35", title: "Search Insert Position", url: "https://leetcode.com/problems/search-insert-position/", difficulty: "Easy", topic: "Lower / Upper Bound", pattern: "Lower Bound" },
        { id: "744", title: "Find Smallest Letter Greater Than Target", url: "https://leetcode.com/problems/find-smallest-letter-greater-than-target/", difficulty: "Easy", topic: "Lower / Upper Bound", pattern: "Upper Bound" },
        { id: "34", title: "Find First and Last Position of Element in Sorted Array", url: "https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/", difficulty: "Medium", topic: "Lower / Upper Bound", pattern: "Lower Bound + Upper Bound" },

        // Binary Search on Answers
        { id: "69", title: "Sqrt(x)", url: "https://leetcode.com/problems/sqrtx/", difficulty: "Easy", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "367", title: "Valid Perfect Square", url: "https://leetcode.com/problems/valid-perfect-square/", difficulty: "Easy", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "875", title: "Koko Eating Bananas", url: "https://leetcode.com/problems/koko-eating-bananas/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "1011", title: "Capacity To Ship Packages Within D Days", url: "https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "1283", title: "Find the Smallest Divisor Given a Threshold", url: "https://leetcode.com/problems/find-the-smallest-divisor-given-a-threshold/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "1482", title: "Minimum Number of Days to Make m Bouquets", url: "https://leetcode.com/problems/minimum-number-of-days-to-make-m-bouquets/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "1552", title: "Magnetic Force Between Two Balls", url: "https://leetcode.com/problems/magnetic-force-between-two-balls/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "1760", title: "Minimum Limit of Balls in a Bag", url: "https://leetcode.com/problems/minimum-limit-of-balls-in-a-bag/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "1870", title: "Minimum Speed to Arrive on Time", url: "https://leetcode.com/problems/minimum-speed-to-arrive-on-time/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "2187", title: "Minimum Time to Complete Trips", url: "https://leetcode.com/problems/minimum-time-to-complete-trips/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "2226", title: "Maximum Candies Allocated to K Children", url: "https://leetcode.com/problems/maximum-candies-allocated-to-k-children/", difficulty: "Medium", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },
        { id: "2251", title: "Number of Flowers in Full Bloom", url: "https://leetcode.com/problems/number-of-flowers-in-full-bloom/", difficulty: "Hard", topic: "Binary Search on Answers", pattern: "Binary Search on Answer + Events" },
        { id: "410", title: "Split Array Largest Sum", url: "https://leetcode.com/problems/split-array-largest-sum/", difficulty: "Hard", topic: "Binary Search on Answers", pattern: "Binary Search on Answer" },

        // Search in 2D Matrix
        { id: "240", title: "Search a 2D Matrix II", url: "https://leetcode.com/problems/search-a-2d-matrix-ii/", difficulty: "Medium", topic: "Search in 2D Matrix", pattern: "Binary Search / Matrix Search" },
        { id: "74", title: "Search a 2D Matrix", url: "https://leetcode.com/problems/search-a-2d-matrix/", difficulty: "Medium", topic: "Search in 2D Matrix", pattern: "Binary Search (Flattened Matrix)" },
        { id: "1901", title: "Find a Peak Element II", url: "https://leetcode.com/problems/find-a-peak-element-ii/", difficulty: "Medium", topic: "Search in 2D Matrix", pattern: "Binary Search on 2D Matrix" },
        { id: "1428", title: "Leftmost Column with at Least a One", url: "https://leetcode.com/problems/leftmost-column-with-at-least-a-one/", difficulty: "Medium", topic: "Search in 2D Matrix", pattern: "Binary Search (Interactive)" },
        { id: "302", title: "Smallest Rectangle Enclosing Black Pixels", url: "https://leetcode.com/problems/smallest-rectangle-enclosing-black-pixels/", difficulty: "Hard", topic: "Search in 2D Matrix", pattern: "Binary Search on Rows & Columns" }
    ];

    const openRoadmapDrawer = (topicName = "Two Pointers") => {
        const drawer = document.getElementById('roadmap-side-drawer');
        const backdrop = document.getElementById('roadmap-drawer-backdrop');
        const titleEl = document.getElementById('drawer-topic-title');
        const tbody = document.getElementById('drawer-problems-tbody');
        const countEl = document.getElementById('drawer-solved-count');
        const fillEl = document.getElementById('drawer-progress-fill');

        if (titleEl) titleEl.textContent = topicName;
        if (!tbody) return;

        tbody.innerHTML = '';
        const solvedList = getSolvedQuestions();

        const filtered = beginnerQuestionsData.filter(q => {
            if (topicName === "Two Pointers") {
                return q.topic === "Two Pointers";
            }
            if (topicName === "Sliding Window") {
                return q.topic === "Sliding Window";
            }
            if (topicName === "Prefix Sum") {
                return q.topic === "Prefix Sum";
            }
            if (topicName === "Kadane's Algorithm") {
                return q.topic === "Kadane's Algorithm";
            }
            if (topicName === "String Two Pointers") {
                return q.topic === "String Two Pointers";
            }
            if (topicName === "String Sliding Window") {
                return q.topic === "String Sliding Window";
            }
            if (topicName === "Frequency Map") {
                return q.topic === "Frequency Map";
            }
            if (topicName === "Prefix Sum + HashMap") {
                return q.topic === "Prefix Sum + HashMap";
            }
            if (topicName === "Classic Binary Search") {
                return q.topic === "Classic Binary Search";
            }
            if (topicName === "Lower / Upper Bound") {
                return q.topic === "Lower / Upper Bound";
            }
            if (topicName === "Binary Search on Answers") {
                return q.topic === "Binary Search on Answers";
            }
            if (topicName === "Search in 2D Matrix") {
                return q.topic === "Search in 2D Matrix";
            }
            if (topicName === "All" || topicName === "Foundation") {
                return q.topic !== "Two Pointers" && q.topic !== "Sliding Window" && q.topic !== "Prefix Sum" && q.topic !== "Kadane's Algorithm" && q.topic !== "String Two Pointers" && q.topic !== "String Sliding Window" && q.topic !== "Frequency Map" && q.topic !== "Prefix Sum + HashMap" && q.topic !== "Classic Binary Search" && q.topic !== "Lower / Upper Bound" && q.topic !== "Binary Search on Answers" && q.topic !== "Search in 2D Matrix";
            }
            return q.topic === topicName;
        });

        const solvedCount = filtered.filter(q => solvedList.some(s => s.link === q.url)).length;
        const totalCount = filtered.length;
        const pct = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;

        if (countEl) countEl.textContent = `(${solvedCount} / ${totalCount})`;
        if (fillEl) fillEl.style.width = `${pct}%`;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding: 30px; color:#64748b;">
                        No questions available for ${escapeHTML(topicName)}.
                    </td>
                </tr>
            `;
        } else {
            filtered.forEach((q, idx) => {
                const tr = document.createElement('tr');
                const isSolved = solvedList.some(s => s.link === q.url);

                let diffBadge = '';
                if (q.difficulty === 'Easy') {
                    diffBadge = '<span style="background:rgba(34,197,94,0.15); color:#4ade80; padding:4px 8px; border-radius:6px; border:1px solid rgba(34,197,94,0.3); font-weight:600; font-size:0.75rem; display:inline-block;">Easy</span>';
                } else if (q.difficulty === 'Medium') {
                    diffBadge = '<span style="background:rgba(234,179,8,0.15); color:#fde047; padding:4px 8px; border-radius:6px; border:1px solid rgba(234,179,8,0.3); font-weight:600; font-size:0.75rem; display:inline-block;">Medium</span>';
                } else {
                    diffBadge = '<span style="background:rgba(239,68,68,0.15); color:#fca5a5; padding:4px 8px; border-radius:6px; border:1px solid rgba(239,68,68,0.3); font-weight:600; font-size:0.75rem; display:inline-block;">Hard</span>';
                }

                tr.innerHTML = `
                    <td style="padding:12px 14px; text-align:center; font-weight:700; color:#64748b; font-size:0.85rem;">${idx + 1}</td>
                    <td style="padding:12px 14px; font-weight:700; color:#3b82f6; font-size:0.9rem;">${escapeHTML(q.id)}</td>
                    <td style="padding:12px 14px;">
                        <a href="${q.url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-weight:600; font-size:0.875rem; text-decoration:none; display:inline-flex; align-items:center; gap:6px; transition:color 0.2s ease;">
                            ${escapeHTML(q.title)}
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#3b82f6" stroke-width="2.5" style="flex-shrink:0;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                    </td>
                    <td style="padding:12px 14px; color:#94a3b8; font-size:0.8rem;">
                        ${diffBadge}
                    </td>
                    <td style="padding:12px 14px; color:#94a3b8; font-size:0.8rem;">
                        <span style="background:rgba(59,130,246,0.14); color:#60a5fa; padding:4px 10px; border-radius:6px; border:1px solid rgba(59,130,246,0.3); font-weight:600; display:inline-block; white-space:nowrap;">
                            ${escapeHTML(q.pattern || 'Two Pointers')}
                        </span>
                    </td>
                    <td style="padding:12px 14px; text-align:center;">
                        <input type="checkbox" class="solve-checkbox" data-link="${q.url}" data-name="${escapeHTML(q.title)}" data-diff="${q.difficulty}" data-topic="${q.topic}" ${isSolved ? 'checked' : ''} style="cursor:pointer; width:18px; height:18px; accent-color:#2563eb;">
                    </td>
                `;

                const problemLink = tr.querySelector('a');
                if (problemLink) {
                    problemLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        safeOpenUrl(q.url);
                    });
                }

                const checkbox = tr.querySelector('.solve-checkbox');
                checkbox.addEventListener('change', (e) => {
                    toggleSolved({ link: q.url, name: q.title, difficulty: q.difficulty, topic: q.topic }, e.target.checked);
                    const newSolved = filtered.filter(item => getSolvedQuestions().some(s => s.link === item.url)).length;
                    const newPct = totalCount > 0 ? Math.round((newSolved / totalCount) * 100) : 0;
                    if (countEl) countEl.textContent = `(${newSolved} / ${totalCount})`;
                    if (fillEl) fillEl.style.width = `${newPct}%`;
                    updateCommandCenter();
                });

                tbody.appendChild(tr);
            });
        }

        if (drawer) drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
    };

    const closeRoadmapDrawer = () => {
        const drawer = document.getElementById('roadmap-side-drawer');
        const backdrop = document.getElementById('roadmap-drawer-backdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
    };

    const closeBtn = document.getElementById('close-roadmap-drawer');
    const backdropEl = document.getElementById('roadmap-drawer-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeRoadmapDrawer);
    if (backdropEl) backdropEl.addEventListener('click', closeRoadmapDrawer);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeRoadmapDrawer();
    });

    const drawRoadmapLines = () => {
        const wrapper = document.getElementById('roadmap-canvas-wrapper');
        const svg = document.getElementById('roadmap-svg-lines');
        if (!wrapper || !svg || wrapper.offsetWidth === 0) return;

        const defs = svg.querySelector('defs');
        svg.innerHTML = '';
        if (defs) svg.appendChild(defs);

        const wrapperRect = wrapper.getBoundingClientRect();

        const connections = [
            // Level 1: Foundation -> Level 2 Categories
            ['node-arrays', 'node-level2-arrays'],
            ['node-arrays', 'node-level2-strings'],
            ['node-arrays', 'node-level2-hashmap'],
            ['node-arrays', 'node-level2-binarysearch'],

            // Level 2 -> Level 3 Sub-nodes
            // Arrays Sub-nodes
            ['node-level2-arrays', 'node-arrays-twopointers'],
            ['node-level2-arrays', 'node-arrays-slidingwindow'],
            ['node-level2-arrays', 'node-arrays-prefixsum'],
            ['node-level2-arrays', 'node-arrays-kadane'],

            // Strings Sub-nodes
            ['node-level2-strings', 'node-strings-twopointer'],
            ['node-level2-strings', 'node-strings-slidingwindow'],

            // Hashmap Sub-nodes
            ['node-level2-hashmap', 'node-hashmap-frequencymap'],
            ['node-level2-hashmap', 'node-hashmap-prefixsum'],

            // Binary Search Sub-nodes
            ['node-level2-binarysearch', 'node-bs-classic'],
            ['node-level2-binarysearch', 'node-bs-bounds'],
            ['node-level2-binarysearch', 'node-bs-answers'],
            ['node-level2-binarysearch', 'node-bs-matrix']
        ];

        connections.forEach(([fromId, toId]) => {
            const fromEl = document.getElementById(fromId);
            const toEl = document.getElementById(toId);
            if (!fromEl || !toEl) return;

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();

            const startX = (fromRect.left + fromRect.width / 2) - wrapperRect.left + wrapper.scrollLeft;
            const startY = fromRect.bottom - wrapperRect.top + wrapper.scrollTop;
            const endX = (toRect.left + toRect.width / 2) - wrapperRect.left + wrapper.scrollLeft;
            const endY = toRect.top - wrapperRect.top + wrapper.scrollTop;

            const midY = startY + (endY - startY) * 0.5;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`);
            path.setAttribute('stroke', 'url(#roadmapGrad)');
            path.setAttribute('stroke-width', '2.8');
            path.setAttribute('fill', 'none');
            path.setAttribute('opacity', '0.95');
            path.setAttribute('marker-end', 'url(#arrowhead)');

            svg.appendChild(path);
        });
    };

    window.addEventListener('resize', drawRoadmapLines);
    const roadmapWrapperEl = document.getElementById('roadmap-canvas-wrapper');
    if (roadmapWrapperEl) {
        roadmapWrapperEl.addEventListener('scroll', drawRoadmapLines);
    }

    const practiceSelectionScreen = document.getElementById('practice-selection-screen');
    const backToPracticeBeginners = document.getElementById('back-to-practice-beginners');
    const backToPracticeCompanywise = document.getElementById('back-to-practice-companywise');

    const showPracticeSelection = () => {
        if (practiceSelectionScreen) practiceSelectionScreen.style.display = 'block';
        if (workspaceBeginners) workspaceBeginners.style.display = 'none';
        if (workspaceCompanywise) workspaceCompanywise.style.display = 'none';
        if (cardModeBeginners) cardModeBeginners.classList.remove('active');
        if (cardModeCompanywise) cardModeCompanywise.classList.remove('active');
    };

    const switchPracticeMode = (mode) => {
        if (mode === 'beginners') {
            if (practiceSelectionScreen) practiceSelectionScreen.style.display = 'none';
            if (cardModeBeginners) cardModeBeginners.classList.add('active');
            if (cardModeCompanywise) cardModeCompanywise.classList.remove('active');
            if (workspaceBeginners) workspaceBeginners.style.display = 'block';
            if (workspaceCompanywise) workspaceCompanywise.style.display = 'none';
            
            drawRoadmapLines();
            setTimeout(drawRoadmapLines, 60);
            setTimeout(drawRoadmapLines, 200);
            setTimeout(drawRoadmapLines, 500);
        } else if (mode === 'companywise') {
            if (practiceSelectionScreen) practiceSelectionScreen.style.display = 'none';
            if (cardModeCompanywise) cardModeCompanywise.classList.add('active');
            if (cardModeBeginners) cardModeBeginners.classList.remove('active');
            if (workspaceCompanywise) workspaceCompanywise.style.display = 'block';
            if (workspaceBeginners) workspaceBeginners.style.display = 'none';
            if (companySelection) companySelection.style.display = 'block';
            if (questionsView) questionsView.style.display = 'none';

            if (allCompanies.length === 0) {
                fetchCompanies().then(() => renderCompanies(allCompanies));
            } else {
                renderCompanies(allCompanies);
            }
        }
    };

    // Back to cards navigation listeners
    if (backToPracticeBeginners) {
        backToPracticeBeginners.addEventListener('click', showPracticeSelection);
    }
    if (backToPracticeCompanywise) {
        backToPracticeCompanywise.addEventListener('click', showPracticeSelection);
    }

    // Node click handlers on Roadmap Tree (Only sub-branch nodes open drawers)
    document.querySelectorAll('.roadmap-node').forEach(node => {
        node.addEventListener('click', () => {
            const title = node.getAttribute('data-title');
            if (['Foundation', 'Arrays', 'Strings', 'Hashmap', 'Binary Search'].includes(title)) {
                return;
            }
            document.querySelectorAll('.roadmap-node').forEach(n => n.classList.remove('active-node'));
            node.classList.add('active-node');
            if (title) {
                openRoadmapDrawer(title);
            }
        });
    });

    if (cardModeBeginners) {
        cardModeBeginners.addEventListener('click', () => switchPracticeMode('beginners'));
    }
    if (cardModeCompanywise) {
        cardModeCompanywise.addEventListener('click', () => switchPracticeMode('companywise'));
    }

    // Top Company Quick Select Pills
    const topCompPills = document.querySelectorAll('.top-comp-pill');
    topCompPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const comp = pill.getAttribute('data-company');
            if (comp) {
                switchPracticeMode('companywise');
                loadCompanyQuestions(comp);
            }
        });
    });

    const enterDsaPrep = async () => {
        if (interviewCategories) interviewCategories.style.display = 'none';
        if (dsaPrepContent) dsaPrepContent.style.display = 'block';
        showPracticeSelection();
    };

    const enterResumeAnalyzer = () => {
        if (interviewCategories) interviewCategories.style.display = 'none';
        if (resumeAnalyzerContent) resumeAnalyzerContent.style.display = 'block';
        if (uploadZone) uploadZone.style.display = 'block';
        if (analysisStatus) analysisStatus.style.display = 'none';
        if (analysisResults) analysisResults.style.display = 'none';
    };

    const fetchCompanies = async () => {
        try {
            const res = await fetch('/get-companies');
            allCompanies = await res.json();
        } catch (err) {
            showToast('Failed to load companies.');
        }
    };

    const renderCompanies = (list) => {
        companiesGrid.innerHTML = '';
        list.forEach(name => {
            const badge = document.createElement('div');
            badge.className = 'company-badge';
            badge.textContent = name;
            badge.onclick = () => loadCompanyQuestions(name);
            companiesGrid.appendChild(badge);
        });
    };

    // ---- Smart Filtering Variables ----
    let currentQuestions = [];
    const filterDifficulty = document.getElementById('filter-difficulty');
    const filterStatus = document.getElementById('filter-status');
    const companySearch = document.getElementById('company-search');

    const inferTopic = (title, url) => {
        const t = (title + ' ' + (url||'')).toLowerCase();
        if (t.includes('tree')) return 'Trees';
        if (t.includes('graph')) return 'Graphs';
        if (t.includes('array') || t.includes('matrix')) return 'Arrays';
        if (t.includes('string')) return 'Strings';
        if (t.includes('list') || t.includes('node')) return 'Linked Lists';
        if (t.includes('dp') || t.includes('dynamic') || t.includes('profit')) return 'Dynamic Prog.';
        return 'Misc';
    };

    const DIFFICULTY_CLASS = { Easy: 'diff-easy', Medium: 'diff-medium', Hard: 'diff-hard' };

    const renderQuestions = (questions) => {
        questionsGrid.innerHTML = '';
        if (!questions || questions.length === 0) {
            questionsGrid.innerHTML = '<p class="empty-state">No questions found.</p>';
            return;
        }

        const solvedList = getSolvedQuestions();
        const diffFilter = filterDifficulty ? filterDifficulty.value : 'All';
        const statFilter = filterStatus ? filterStatus.value : 'All';

        let filtered = questions.filter(q => {
            const isSolved = solvedList.some(s => s.link === q.url);
            if (diffFilter !== 'All' && q.difficulty !== diffFilter) return false;
            if (statFilter === 'Completed' && !isSolved) return false;
            if (statFilter === 'Pending' && isSolved) return false;
            return true;
        });

        if (filtered.length === 0) {
            questionsGrid.innerHTML = '<p class="empty-state">No questions match your filters.</p>';
            return;
        }

        filtered.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'resource-card show';
            
            const id         = q.id         || '';
            const name       = q.title       || 'Unknown Problem';
            const link       = q.url         || '#';
            const difficulty = q.difficulty  || '';
            const topic      = inferTopic(name, link);
            const acceptance = q.acceptance  || '';
            const frequency  = q.frequency   || '';
            const others     = q.other_companies || [];
            const isSolved   = solvedList.some(s => s.link === link);

            const diffClass  = DIFFICULTY_CLASS[difficulty] || '';
            const freqNum    = parseFloat(frequency) || 0;

            card.innerHTML = `
                <div class="card-header">
                    ${id ? `<span class="rank-badge lc-id">#${escapeHTML(id)}</span>` : `<span class="rank-badge">#${index + 1}</span>`}
                    <div class="card-badges">
                        ${difficulty ? `<span class="pill-badge diff-pill ${diffClass}">${escapeHTML(difficulty)}</span>` : ''}
                        <span class="pill-badge" style="background:rgba(0,0,0,0.03); border-color:transparent;">${topic}</span>
                    </div>
                </div>

                <div class="card-check-wrap">
                    <input type="checkbox" class="solve-checkbox"
                        data-link="${link}"
                        data-name="${escapeHTML(name)}"
                        data-diff="${difficulty}"
                        data-topic="${topic}"
                        ${isSolved ? 'checked' : ''}>
                    <span class="solve-label">${isSolved ? 'Solved' : 'Mark as Solved'}</span>
                </div>

                <h3 class="card-title">${escapeHTML(name)}</h3>

                <div style="font-size:0.75rem; color:var(--text-sub); display:flex; gap:12px; margin-bottom:8px;">
                    ${acceptance ? `<span>Acceptance: <strong>${escapeHTML(acceptance)}</strong></span>` : ''}
                    ${frequency  ? `<span>Frequency: <strong>${escapeHTML(frequency)}</strong></span>` : ''}
                </div>

                ${freqNum > 0 ? `
                <div style="height:4px; background:#e2e8f0; border-radius:99px; overflow:hidden; margin-bottom:12px; width:100%;">
                    <div style="height:100%; background:var(--primary); width:${Math.min(freqNum, 100)}%;"></div>
                </div>` : ''}

                ${others.length > 0 ? `
                <div class="other-companies-wrap">
                    <span style="font-size:0.65rem; color:var(--text-muted); width:100%;">Also asked at:</span>
                    ${others.slice(0, 5).map(c => `<span class="other-comp-tag">${escapeHTML(c)}</span>`).join('')}
                    ${others.length > 5 ? `<span class="other-comp-tag">+${others.length - 5} more</span>` : ''}
                </div>` : ''}

                <a href="${link}" target="_blank" class="btn-watch" rel="noopener noreferrer" style="margin-top:16px;">
                    Solve on LeetCode →
                </a>
            `;

            const solveLink = card.querySelector('.btn-watch');
            if (solveLink) {
                solveLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    safeOpenUrl(link);
                });
            }

            const checkbox = card.querySelector('.solve-checkbox');
            checkbox.addEventListener('change', (e) => {
                toggleSolved({ link, name, difficulty, topic }, e.target.checked);
                card.querySelector('.solve-label').textContent = e.target.checked ? 'Solved' : 'Mark as Solved';
                updateCommandCenter();
            });

            questionsGrid.appendChild(card);
        });
    };

    if (filterDifficulty) filterDifficulty.addEventListener('change', () => renderQuestions(currentQuestions));
    if (filterStatus) filterStatus.addEventListener('change', () => renderQuestions(currentQuestions));

    const loadCompanyQuestions = async (company) => {
        companySelection.style.display = 'none';
        questionsView.style.display = 'block';
        selectedCompanyTitle.textContent = company;
        questionsGrid.innerHTML = '<div class="loading-indicator" style="display:block;"><div class="spinner"></div><p>Fetching questions...</p></div>';

        try {
            const res = await fetch(`/get-questions?company=${encodeURIComponent(company)}`);
            const data = await res.json();
            currentQuestions = data.questions;
            renderQuestions(currentQuestions);
        } catch (err) {
            showToast('Failed to load questions.');
        }
    };

    /**
     * Solved Questions State & Command Center Automation
     */
    let solvedDsaQuestions = (() => {
        try {
            const stored = localStorage.getItem('solvedDsaQuestions');
            return stored ? JSON.parse(stored) : [];
        } catch(e) {
            return [];
        }
    })();
    let leetcodeStats = null;
    
    const getSolvedQuestions = () => {
        return solvedDsaQuestions;
    };

    const safeOpenUrl = (targetUrl) => {
        if (!targetUrl || targetUrl === '#') return;
        let cleanUrl = targetUrl.trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }
        window.open(cleanUrl, '_blank', 'noopener,noreferrer');
    };

    const toggleSolved = (q, isChecked) => {
        if (isChecked) {
            if (!solvedDsaQuestions.find(s => s.link === q.link)) {
                solvedDsaQuestions.push({ ...q, solvedAt: new Date().toISOString(), revisions: 0 });
            } else {
                let existing = solvedDsaQuestions.find(s => s.link === q.link);
                existing.revisions = (existing.revisions || 0) + 1;
            }
        } else {
            solvedDsaQuestions = solvedDsaQuestions.filter(s => s.link !== q.link);
        }

        // Persist to localStorage for instant client-side responsiveness
        try {
            localStorage.setItem('solvedDsaQuestions', JSON.stringify(solvedDsaQuestions));
        } catch(e) {}

        // Sync to backend Supabase database
        fetch('/sync-dsa-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ solved_list: solvedDsaQuestions })
        }).catch(err => console.error("DSA sync failed:", err));

        // Immediately update Dashboard metrics & graphs
        updateCommandCenter();
    };

    let charts = {};
    const updateCommandCenter = () => {
        const solved = getSolvedQuestions();
        const GOAL = 500;
        
        // Calculate Topic & Difficulty Counts
        let localEasy = solved.filter(s => (s.difficulty || '').toLowerCase() === 'easy').length;
        let localMedium = solved.filter(s => (s.difficulty || '').toLowerCase() === 'medium' || (s.difficulty || '').toLowerCase() === 'med').length;
        let localHard = solved.filter(s => (s.difficulty || '').toLowerCase() === 'hard').length;
        
        const counts = { Easy: localEasy, Medium: localMedium, Hard: localHard };
        if (leetcodeStats) {
            counts.Easy = Math.max(counts.Easy, leetcodeStats.Easy || 0);
            counts.Medium = Math.max(counts.Medium, leetcodeStats.Medium || 0);
            counts.Hard = Math.max(counts.Hard, leetcodeStats.Hard || 0);
        }
        
        // 1. Calculate stats
        let totalSolved = Math.max(solved.length, counts.Easy + counts.Medium + counts.Hard);
        if (leetcodeStats) {
            totalSolved = Math.max(totalSolved, leetcodeStats.All || 0);
        }
        
        const completionPct = Math.min(100, Math.round((totalSolved / GOAL) * 100));
        const totalRevisions = solved.reduce((acc, s) => acc + (s.revisions || 0), 0);
        
        // Calculate Streak
        let streak = 0;
        let dates = [...new Set(solved.map(s => new Date(s.solvedAt).toDateString()))].sort((a,b)=>new Date(b)-new Date(a));
        if (dates.length > 0) {
            let curr = new Date();
            for(let d of dates) {
                if (new Date(d).toDateString() === curr.toDateString() || streak === 0 && (curr - new Date(d)) < 172800000) {
                    streak++;
                    curr.setDate(curr.getDate() - 1);
                } else break;
            }
        }

        const topicCounts = {};
        solved.forEach(s => {
            topicCounts[s.topic || 'Misc'] = (topicCounts[s.topic || 'Misc'] || 0) + 1;
        });

        const readinessRaw = (counts.Hard * 3 + counts.Medium * 2 + counts.Easy * 1);
        const readinessScore = Math.min(100, Math.round((readinessRaw / (GOAL * 2)) * 100));
        let rank = readinessScore < 30 ? 'Novice' : readinessScore < 70 ? 'Proficient' : 'Elite';

        // 2. Update Sidebar Streak Widget
        document.getElementById('sidebar-streak-days').textContent = `${streak} days`;

        // 3. Update 4-KPI Circular Dashboard Ring Cards
        const savedPl = getSavedPlaylists();
        let totalPlaylistVideos = 0;
        let completedPlaylistVideos = 0;
        savedPl.forEach(p => {
            if (p.videos) {
                totalPlaylistVideos += p.videos.length;
                completedPlaylistVideos += p.videos.filter(v => v.completed).length;
            }
        });

        // 3a. Calculate Learning Progress % based on saved YouTube playlists from Supabase
        let learningPct = 0;
        if (totalPlaylistVideos > 0) {
            learningPct = Math.round((completedPlaylistVideos / totalPlaylistVideos) * 100);
        } else if (savedPl.length > 0) {
            const completedCount = savedPl.filter(p => p.completed).length;
            learningPct = Math.round((completedCount / savedPl.length) * 100);
        }

        const elValLearning = document.getElementById('val-learning-progress');
        const elRingLearning = document.getElementById('ring-learning-progress');
        const elSubLearning = document.getElementById('sub-learning-progress');
        if (elValLearning) elValLearning.textContent = `${learningPct}%`;
        if (elRingLearning) {
            const offsetLearning = 251.32 - (251.32 * learningPct / 100);
            elRingLearning.style.strokeDashoffset = offsetLearning;
        }
        if (elSubLearning) {
            elSubLearning.textContent = savedPl.length > 0 ? `${completedPlaylistVideos}/${totalPlaylistVideos} videos completed` : 'No saved playlists';
        }

        // 3b. Calculate Resume Readiness % from Supabase
        let resumePct = 0;
        if (latestResumeAnalysis && latestResumeAnalysis.score !== undefined && latestResumeAnalysis.score !== null) {
            const s = Number(latestResumeAnalysis.score);
            resumePct = s > 10 ? Math.round(s) : Math.round(s * 10);
        }
        const elValResume = document.getElementById('val-resume-readiness');
        const elRingResume = document.getElementById('ring-resume-readiness');
        const elSubResume = document.getElementById('sub-resume-readiness');
        if (elValResume) elValResume.textContent = `${resumePct}%`;
        if (elRingResume) {
            const offsetResume = 251.32 - (251.32 * resumePct / 100);
            elRingResume.style.strokeDashoffset = offsetResume;
        }
        if (elSubResume) {
            elSubResume.textContent = latestResumeAnalysis ? `ATS Score: ${resumePct}%` : 'No upload yet';
        }

        // 3c. Calculate Interview Readiness % (Locked)
        const elValInterview = document.getElementById('val-interview-readiness');
        const elRingInterview = document.getElementById('ring-interview-readiness');
        const elSubInterview = document.getElementById('sub-interview-readiness');
        if (elValInterview) elValInterview.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Locked`;
        if (elRingInterview) {
            elRingInterview.style.strokeDashoffset = 251.32;
        }
        if (elSubInterview) {
            elSubInterview.textContent = 'Currently Locked';
        }

        // 3d. Calculate AI Career Health % (Weighted composite of active user activity)
        const interviewPct = 0;
        const dsaPct = Math.min(100, Math.round((totalSolved / GOAL) * 100));
        const activeScores = [];
        if (dsaPct > 0) activeScores.push(dsaPct);
        if (resumePct > 0) activeScores.push(resumePct);
        if (interviewPct > 0) activeScores.push(interviewPct);
        if (learningPct > 0) activeScores.push(learningPct);

        let careerHealthPct = 0;
        if (activeScores.length > 0) {
            careerHealthPct = Math.round(activeScores.reduce((a, b) => a + b, 0) / activeScores.length);
        }

        const elValCareer = document.getElementById('val-career-health');
        const elRingCareer = document.getElementById('ring-career-health');
        const elSubCareer = document.getElementById('sub-career-health');
        if (elValCareer) elValCareer.textContent = `${careerHealthPct}%`;
        if (elRingCareer) {
            const offsetCareer = 251.32 - (251.32 * careerHealthPct / 100);
            elRingCareer.style.strokeDashoffset = offsetCareer;
        }
        if (elSubCareer) {
            elSubCareer.textContent = careerHealthPct > 0 ? 'Progressing well' : 'Start your prep';
        }

        // 4. Update Resume Score Card & Database records
        loadResumeScore();

        // 5. Update Practice Overview KPIs — real data
        document.getElementById('overview-solved-count').textContent = totalSolved;
        document.getElementById('overview-success-rate').textContent = totalSolved > 0 ? `${Math.round((counts.Easy * 100 + counts.Medium * 70 + counts.Hard * 50) / Math.max(1, totalSolved))}%` : '0%';
        document.getElementById('overview-streak').textContent = streak;

        // 6. Draw Dashboard Consistency Chart
        drawDashboardConsistencyChart(solved);

        // 7. Draw Dashboard Skill Distribution (doughnut)
        drawDashboardSkillDistribution();

        // 8. Draw Sidebar Streak Sparkline
        drawSidebarStreakSparkline();
    };

    let latestResumeAnalysis = null;
    let latestInterviewScore = null;

    const loadResumeScore = async () => {
        try {
            const res = await fetch('/get-latest-resume');
            if (res.ok) {
                const dbData = await res.json();
                if (dbData) {
                    latestResumeAnalysis = dbData;
                }
            }
        } catch (e) {
            console.error("Failed to load resume analysis from DB:", e);
        }

        const data = latestResumeAnalysis;
        const scoreEl = document.getElementById('dashboard-resume-score');
        const verdictEl = document.getElementById('dashboard-resume-verdict');
        const impactEl = document.getElementById('dashboard-resume-impact');
        const skillsEl = document.getElementById('dashboard-resume-skills');
        const atsEl = document.getElementById('dashboard-resume-ats');

        if (data) {
            if (scoreEl) scoreEl.textContent = `${data.score}/100`;
            if (verdictEl) {
                verdictEl.textContent = data.verdict;
                verdictEl.className = 'score-verdict';
                if (data.verdict.toLowerCase().includes('reject') || data.verdict.toLowerCase().includes('no')) {
                    verdictEl.classList.add('text-danger');
                } else if (data.verdict.toLowerCase().includes('borderline')) {
                    verdictEl.classList.add('text-warning');
                } else {
                    verdictEl.classList.add('text-success');
                }
            }
            if (impactEl) impactEl.textContent = data.impact;
            if (skillsEl) skillsEl.textContent = data.match;
            if (atsEl) atsEl.textContent = typeof data.ats === 'number' ? `${data.ats}%` : data.ats;
        } else {
            // No resume uploaded yet — show empty state
            if (scoreEl) scoreEl.textContent = '—/100';
            if (verdictEl) {
                verdictEl.textContent = 'Not analyzed yet';
                verdictEl.className = 'score-verdict';
            }
            if (impactEl) impactEl.textContent = '—';
            if (skillsEl) skillsEl.textContent = '—';
            if (atsEl) atsEl.textContent = '—';
        }
    };

    // --- CHART BUILDERS (Light Theme configured) ---
    const drawDashboardConsistencyChart = (solved) => {
        if (!window.Chart) return;
        const ctx = document.getElementById('dashboardConsistencyChart');
        if (!ctx) return;

        if (charts.dashCons) charts.dashCons.destroy();

        const last7 = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toDateString();
        }).reverse();
        
        // Use zeroed trend if no activity yet
        let trendData = [0, 0, 0, 0, 0, 0, 0];
        if (solved && solved.length > 0) {
            const calculated = last7.map(date => solved.filter(s => new Date(s.solvedAt).toDateString() === date).length * 10);
            trendData = calculated;
        }

        charts.dashCons = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Practice Score',
                    data: trendData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#94a3b8' } },
                    y: { display: false }
                }
            }
        });
    };

    const drawDashboardSkillDistribution = () => {
        if (!window.Chart) return;
        const ctx = document.getElementById('dashboardSkillDistributionChart');
        if (!ctx) return;

        if (charts.dashDist) charts.dashDist.destroy();

        // Calculate real distribution from solved DSA + saved playlists
        const solved = getSolvedQuestions();
        const savedPl = getSavedPlaylists();
        let dsaCount = solved.length;
        if (leetcodeStats) {
            dsaCount = Math.max(dsaCount, leetcodeStats.All || 0);
        }
        const sdCount = savedPl.filter(p => (p.title + ' ' + (p.skill || '')).toLowerCase().includes('system')).length;
        const aiCount = savedPl.filter(p => /(ai|ml|machine|deep|neural)/i.test(p.title + ' ' + (p.skill || ''))).length;
        const devCount = savedPl.filter(p => {
            const t = (p.title + ' ' + (p.skill || '')).toLowerCase();
            return !t.includes('system') && !/(ai|ml|machine|deep|neural)/i.test(t);
        }).length;

        // If no data at all, show equal placeholder
        const hasData = dsaCount + sdCount + aiCount + devCount > 0;
        const chartData = hasData ? [dsaCount, sdCount, aiCount, devCount] : [1, 1, 1, 1];

        // Update legend percentages in UI
        const dsaPctText = document.getElementById('legend-pct-dsa');
        const sdPctText = document.getElementById('legend-pct-sd');
        const aiPctText = document.getElementById('legend-pct-aiml');
        const devPctText = document.getElementById('legend-pct-dev');

        if (hasData) {
            const totalCount = dsaCount + sdCount + aiCount + devCount;
            if (dsaPctText) dsaPctText.textContent = `${Math.round(dsaCount / totalCount * 100)}%`;
            if (sdPctText) sdPctText.textContent = `${Math.round(sdCount / totalCount * 100)}%`;
            if (aiPctText) aiPctText.textContent = `${Math.round(aiCount / totalCount * 100)}%`;
            if (devPctText) devPctText.textContent = `${Math.round(devCount / totalCount * 100)}%`;
        } else {
            if (dsaPctText) dsaPctText.textContent = `0%`;
            if (sdPctText) sdPctText.textContent = `0%`;
            if (aiPctText) aiPctText.textContent = `0%`;
            if (devPctText) devPctText.textContent = `0%`;
        }

        charts.dashDist = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['DSA', 'System Design', 'AI/ML', 'Development'],
                datasets: [{
                    data: chartData,
                    backgroundColor: hasData
                        ? ['#3b82f6', '#10b981', '#f59e0b', '#6366f1']
                        : ['#e5e7eb', '#e5e7eb', '#e5e7eb', '#e5e7eb'],
                    borderWidth: 4,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                cutout: '75%'
            }
        });
    };

    const drawSidebarStreakSparkline = () => {
        if (!window.Chart) return;
        const ctx = document.getElementById('sidebarSparklineCanvas');
        if (!ctx) return;

        if (charts.sparkline) charts.sparkline.destroy();

        // Calculate real activity per day for last 7 days
        const solved = getSolvedQuestions();
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStr = d.toDateString();
            const count = solved.filter(s => new Date(s.solvedAt).toDateString() === dayStr).length;
            last7.push(count);
        }

        charts.sparkline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [1, 2, 3, 4, 5, 6, 7],
                datasets: [{
                    data: last7,
                    borderColor: '#f97316',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    };

    let analyticsEventsBound = false;

    const renderAnalyticsCharts = async () => {
        if (!window.Chart) return;
        
        // --- 1. GET DATA SOURCES ---
        const solved = getSolvedQuestions();
        const savedPl = getSavedPlaylists();
        
        // Timeframe filter
        const timeframeEl = document.getElementById('analytics-timeframe');
        const daysToFilter = timeframeEl ? timeframeEl.value : "30";
        
        // --- 2. CALCULATE KPI STATS ---
        let totalSolved = solved.length;
        const counts = { Easy: 0, Medium: 0, Hard: 0 };
        const topicCounts = {};
        solved.forEach(s => {
            counts[s.difficulty || 'Easy']++;
            topicCounts[s.topic || 'Misc'] = (topicCounts[s.topic || 'Misc'] || 0) + 1;
        });

        if (leetcodeStats) {
            counts.Easy = Math.max(counts.Easy, leetcodeStats.Easy || 0);
            counts.Medium = Math.max(counts.Medium, leetcodeStats.Medium || 0);
            counts.Hard = Math.max(counts.Hard, leetcodeStats.Hard || 0);
            totalSolved = Math.max(totalSolved, leetcodeStats.All || 0);
        }
        
        // Update Problems Solved UI
        const dsaCountEl = document.getElementById('analytics-dsa-count');
        if (dsaCountEl) dsaCountEl.textContent = totalSolved;
        const easyEl = document.getElementById('analytics-dsa-easy');
        if (easyEl) easyEl.textContent = counts.Easy;
        const medEl = document.getElementById('analytics-dsa-med');
        if (medEl) medEl.textContent = counts.Medium;
        const hardEl = document.getElementById('analytics-dsa-hard');
        if (hardEl) hardEl.textContent = counts.Hard;
        
        // Calculate Active Playlists completion
        let totalPlaylistVideos = 0;
        let completedPlaylistVideos = 0;
        savedPl.forEach(p => {
            if (p.videos) {
                totalPlaylistVideos += p.videos.length;
                completedPlaylistVideos += p.videos.filter(v => v.completed).length;
            }
        });
        const playlistCompletionPct = totalPlaylistVideos > 0 ? (completedPlaylistVideos / totalPlaylistVideos * 100) : 0;
        
        // Fetch custom projects count
        let customProjectsCount = 0;
        try {
            const projectsRes = await fetch('/get-user-projects');
            if (projectsRes.ok) {
                const plist = await projectsRes.json();
                if (Array.isArray(plist)) customProjectsCount = plist.length;
            }
        } catch (e) {
            console.error("Failed to load custom projects for analytics:", e);
        }
        
        // Load latest resume score
        let resumeScore = 0;
        let resumeVerdictText = "No Resume Uploaded";
        const atsScoreEl = document.getElementById('analytics-ats-score');
        const atsVerdictEl = document.getElementById('analytics-ats-verdict');
        if (latestResumeAnalysis) {
            resumeScore = latestResumeAnalysis.score;
            resumeVerdictText = latestResumeAnalysis.verdict;
        } else {
            // Check if we can load it from backend
            try {
                const res = await fetch('/get-latest-resume');
                if (res.ok) {
                    const dbData = await res.json();
                    if (dbData) {
                        resumeScore = dbData.score;
                        resumeVerdictText = dbData.verdict;
                        latestResumeAnalysis = dbData;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch resume for analytics:", e);
            }
        }
        if (atsScoreEl) atsScoreEl.textContent = latestResumeAnalysis ? `${resumeScore}%` : '—';
        if (atsVerdictEl) {
            atsVerdictEl.textContent = resumeVerdictText;
            atsVerdictEl.style.color = latestResumeAnalysis ? 'var(--primary)' : 'var(--text-muted)';
        }

        // Calculate study velocity: items completed in selected timeframe
        let velocityItems = 0;
        const now = new Date();
        const timeframeMs = (daysToFilter === "all" ? 365 : parseInt(daysToFilter)) * 24 * 60 * 60 * 1000;
        
        // Filter solved DSA in timeframe
        solved.forEach(s => {
            if (daysToFilter === "all" || (now - new Date(s.solvedAt)) <= timeframeMs) {
                velocityItems++;
            }
        });
        
        const weeks = daysToFilter === "all" ? 12 : (parseInt(daysToFilter) / 7);
        const studyVelocity = (velocityItems / Math.max(1, weeks)).toFixed(1);
        
        const velocityEl = document.getElementById('analytics-weekly-velocity');
        if (velocityEl) velocityEl.textContent = studyVelocity;
        
        // Compute Readiness Score (PRI)
        const dsaScoreVal = Math.min(100, Math.round(totalSolved / 200 * 100)); // 200 is benchmark solved questions
        const projectScoreVal = Math.min(100, customProjectsCount * 35); // 3 projects = 100%
        const priScore = Math.round((dsaScoreVal * 0.4) + (resumeScore * 0.3) + (playlistCompletionPct * 0.15) + (projectScoreVal * 0.15));
        
        const priScoreEl = document.getElementById('analytics-pri-score');
        const priBadgeEl = document.getElementById('analytics-pri-badge');
        const priRingEl = document.getElementById('analytics-pri-ring');
        
        if (priScoreEl) priScoreEl.textContent = `${priScore}%`;
        if (priBadgeEl) {
            let rank = 'Novice';
            if (priScore >= 75) {
                rank = 'FAANG Tier';
                priBadgeEl.style.background = 'var(--success-light)';
                priBadgeEl.style.color = 'var(--success)';
            } else if (priScore >= 45) {
                rank = 'Proficient';
                priBadgeEl.style.background = 'var(--warning-light)';
                priBadgeEl.style.color = 'var(--warning)';
            } else {
                priBadgeEl.style.background = 'var(--primary-light)';
                priBadgeEl.style.color = 'var(--primary)';
            }
            priBadgeEl.textContent = rank;
        }
        if (priRingEl) {
            // Circumference of r=28 circle is 2 * PI * 28 = 175.93
            const offset = 175.93 - (175.93 * priScore / 100);
            priRingEl.style.strokeDashoffset = offset;
        }

        // --- 3. DRAW RADAR CHART ---
        const radarCtx = document.getElementById('analyticsRadarChart');
        if (radarCtx) {
            if (charts.analyticsRadar) charts.analyticsRadar.destroy();
            
            // Skill levels
            const dsaComp = Math.min(100, Math.round((counts.Easy * 30 + counts.Medium * 70 + counts.Hard * 100) / Math.max(1, totalSolved)));
            
            // Categories logic: System design vs AI/ML vs Dev
            const sdPlaylists = savedPl.filter(p => (p.title + ' ' + (p.skill || '')).toLowerCase().includes('system'));
            const sdDone = sdPlaylists.reduce((a, p) => a + (p.videos ? p.videos.filter(v => v.completed).length : 0), 0);
            const sdTotal = sdPlaylists.reduce((a, p) => a + (p.videos ? p.videos.length : 0), 0);
            const sdComp = sdTotal > 0 ? Math.round(sdDone / sdTotal * 100) : 0;
            
            const aiPlaylists = savedPl.filter(p => /(ai|ml|machine|deep|neural)/i.test(p.title + ' ' + (p.skill || '')));
            const aiDone = aiPlaylists.reduce((a, p) => a + (p.videos ? p.videos.filter(v => v.completed).length : 0), 0);
            const aiTotal = aiPlaylists.reduce((a, p) => a + (p.videos ? p.videos.length : 0), 0);
            const aiComp = aiTotal > 0 ? Math.round(aiDone / aiTotal * 100) : 0;
            
            const devComp = Math.min(100, Math.round((customProjectsCount * 30) + (playlistCompletionPct * 0.7)));

            charts.analyticsRadar = new Chart(radarCtx, {
                type: 'radar',
                data: {
                    labels: ['Data Structures', 'System Design', 'AI/ML Breadth', 'Dev & Projects'],
                    datasets: [
                        {
                            label: 'Your Level',
                            data: [dsaComp || 10, sdComp || 10, aiComp || 10, devComp || 10],
                            backgroundColor: 'rgba(37, 99, 235, 0.2)',
                            borderColor: '#2563eb',
                            pointBackgroundColor: '#2563eb',
                            borderWidth: 2
                        },
                        {
                            label: 'FAANG Benchmark',
                            data: [90, 80, 70, 85],
                            backgroundColor: 'rgba(148, 163, 184, 0.1)',
                            borderColor: '#94a3b8',
                            pointBackgroundColor: '#94a3b8',
                            borderWidth: 1,
                            borderDash: [4, 4]
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            angleLines: { display: true },
                            suggestedMin: 0,
                            suggestedMax: 100,
                            ticks: { stepSize: 20, display: false }
                        }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
                    }
                }
            });
        }

        // --- 4. DRAW CUMULATIVE VELOCITY LINE CHART ---
        const growthCtx = document.getElementById('analyticsGrowthChart');
        if (growthCtx) {
            if (charts.analyticsGrowth) charts.analyticsGrowth.destroy();
            
            // Build daily activity array for chosen timeframe
            const limitDays = daysToFilter === "all" ? 90 : parseInt(daysToFilter);
            const dates = [];
            const cumulativeData = [];
            let currentSum = 0;
            
            const solvedSorted = [...solved].sort((a,b) => new Date(a.solvedAt) - new Date(b.solvedAt));
            
            for (let i = limitDays - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateString = d.toDateString();
                
                // Solve count on this exact day
                const solvedOnDay = solvedSorted.filter(s => new Date(s.solvedAt).toDateString() === dateString).length;
                currentSum += solvedOnDay;
                
                dates.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
                cumulativeData.push(currentSum);
            }
            
            charts.analyticsGrowth = new Chart(growthCtx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: 'Solved Questions (Cumulative)',
                        data: cumulativeData,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.08)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: limitDays > 30 ? 0 : 2,
                        pointHoverRadius: 4
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
                        y: { beginAtZero: true, ticks: { font: { size: 10 } } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        // --- 5. DRAW 30-DAY PRACTICE HEATMAP ---
        const heatmapContainer = document.getElementById('analytics-heatmap-container');
        if (heatmapContainer) {
            heatmapContainer.innerHTML = '';
            
            // Generate last 30 blocks
            for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayStr = d.toDateString();
                
                const dsaCountOnDay = solved.filter(s => new Date(s.solvedAt).toDateString() === dayStr).length;
                // Simulating learning video completes on day
                const videoCountOnDay = Math.random() > 0.85 ? 1 : 0;
                
                const totalActions = dsaCountOnDay + videoCountOnDay;
                
                // Set color intensity class
                let color = '#e2e8f0'; // 0 actions
                if (totalActions === 1) color = '#dbeafe'; // 1 action
                else if (totalActions === 2 || totalActions === 3) color = '#93c5fd'; // 2-3 actions
                else if (totalActions >= 4) color = '#2563eb'; // 4+ actions
                
                const block = document.createElement('div');
                block.className = 'heatmap-block';
                block.style.backgroundColor = color;
                
                const formattedDate = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                block.setAttribute('data-tooltip', `${formattedDate}: ${totalActions} learning commits (${dsaCountOnDay} solved, ${videoCountOnDay} videos)`);
                
                heatmapContainer.appendChild(block);
            }
        }

        // --- 6. DRAW TOP TOPICS MASTERED ---
        const topicCtx = document.getElementById('analyticsTopicChart');
        if (topicCtx) {
            if (charts.analyticsTopic) charts.analyticsTopic.destroy();
            const topTopics = Object.entries(topicCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
            
            charts.analyticsTopic = new Chart(topicCtx, {
                type: 'bar',
                data: {
                    labels: topTopics.length > 0 ? topTopics.map(t=>t[0]) : ['DSA', 'System Design', 'ML', 'Web Dev', 'Misc'],
                    datasets: [{
                        label: 'Mastery Level',
                        data: topTopics.length > 0 ? topTopics.map(t=>t[1]) : [0, 0, 0, 0, 0],
                        backgroundColor: '#2563eb',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, ticks: { font: { size: 10 } } },
                        y: { ticks: { font: { size: 10 } } }
                    }
                }
            });
        }
        
        // Check local storage for existing audit
        loadCompetencyAuditFromStorage();

        // --- 7. BIND INTERACTIVE EVENT LISTENERS ---
        if (!analyticsEventsBound) {
            if (timeframeEl) {
                timeframeEl.addEventListener('change', () => {
                    renderAnalyticsCharts();
                });
            }
            
            const btnTriggerAudit = document.getElementById('btn-trigger-audit');
            const btnGenerateAuditInner = document.getElementById('btn-generate-audit-inner');
            const btnReAudit = document.getElementById('btn-re-audit');
            
            const triggerAuditFlow = () => {
                runAICompetencyAudit();
            };
            
            if (btnTriggerAudit) btnTriggerAudit.addEventListener('click', triggerAuditFlow);
            if (btnGenerateAuditInner) btnGenerateAuditInner.addEventListener('click', triggerAuditFlow);
            if (btnReAudit) btnReAudit.addEventListener('click', triggerAuditFlow);
            
            analyticsEventsBound = true;
        }
    };
    
    // AI Audit generation call
    const runAICompetencyAudit = async () => {
        const initDiv = document.getElementById('audit-state-initial');
        const loadDiv = document.getElementById('audit-state-loading');
        const resultDiv = document.getElementById('audit-state-result');
        const loadingText = document.getElementById('audit-loading-text');
        
        if (initDiv) initDiv.style.display = 'none';
        if (loadDiv) loadDiv.style.display = 'block';
        if (resultDiv) resultDiv.style.display = 'none';
        
        // Loader phrases loop
        const loaderSteps = [
            "Parsing practice problem logs...",
            "Validating system design coverage...",
            "Comparing profile against target role benchmarks...",
            "Simulating ATS resume skim...",
            "Finalizing competency audit report..."
        ];
        let loaderIdx = 0;
        const loaderInt = setInterval(() => {
            if (loadingText && loaderIdx < loaderSteps.length) {
                loadingText.textContent = loaderSteps[loaderIdx++];
            }
        }, 1800);
        
        try {
            const res = await fetch('/generate-competency-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            clearInterval(loaderInt);
            
            if (!res.ok) {
                throw new Error("Audit failed or timed out.");
            }
            
            const auditData = await res.json();
            
            // Save audit data in localStorage for persistence
            localStorage.setItem('career_competency_audit', JSON.stringify(auditData));
            
            renderAuditResult(auditData);
            
        } catch (err) {
            clearInterval(loaderInt);
            showToast("Failed to generate career competency audit.");
            if (initDiv) initDiv.style.display = 'block';
            if (loadDiv) loadDiv.style.display = 'none';
        }
    };
    
    const renderAuditResult = (data) => {
        const initDiv = document.getElementById('audit-state-initial');
        const loadDiv = document.getElementById('audit-state-loading');
        const resultDiv = document.getElementById('audit-state-result');
        
        if (initDiv) initDiv.style.display = 'none';
        if (loadDiv) loadDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'flex';
        
        document.getElementById('audit-market-level').textContent = data.market_ready_level || 'Junior (L3)';
        document.getElementById('audit-verdict-text').textContent = `"${data.readiness_verdict}"`;
        document.getElementById('audit-weeks').textContent = data.estimated_weeks_to_target || '—';
        
        // Render technical gaps
        const gapsList = document.getElementById('audit-gaps-list');
        if (gapsList) {
            gapsList.innerHTML = '';
            (data.technical_gaps || []).forEach(gap => {
                const li = document.createElement('li');
                li.style.lineHeight = '1.5';
                li.textContent = gap;
                gapsList.appendChild(li);
            });
            if (!data.technical_gaps || data.technical_gaps.length === 0) {
                gapsList.innerHTML = '<li>No significant competency gaps found. Keep practicing!</li>';
            }
        }
        
        // Render action items
        const actionsList = document.getElementById('audit-actions-list');
        if (actionsList) {
            actionsList.innerHTML = '';
            (data.action_items || []).forEach(action => {
                const li = document.createElement('li');
                li.style.lineHeight = '1.5';
                li.innerHTML = `<strong>TODO:</strong> ${escapeHTML(action)}`;
                actionsList.appendChild(li);
            });
            if (!data.action_items || data.action_items.length === 0) {
                actionsList.innerHTML = '<li>All standard action checklist items completed!</li>';
            }
        }
    };
    
    const loadCompetencyAuditFromStorage = async () => {
        // Try to fetch from Supabase
        try {
            const res = await fetch('/get-competency-audit');
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    renderAuditResult(data);
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to load audit from Supabase:", e);
        }

        // Fallback to localStorage
        const stored = localStorage.getItem('career_competency_audit');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                renderAuditResult(data);
            } catch(e) {
                localStorage.removeItem('career_competency_audit');
            }
        }
    };

    const renderDashboardProgress = () => {
        updateCommandCenter();
        renderSavedPlaylists();
    };

    // Real Resume Analysis uploader logic
    const handleResumeAnalysis = async (file) => {
        const role = document.getElementById('target-role').value.trim() || "Software Engineer";
        const benchmark = document.getElementById('target-benchmark').value;

        // Reset and show loading
        uploadZone.style.display = 'none';
        analysisStatus.style.display = 'block';
        analysisResults.style.display = 'none';
        statusText.textContent = "Uploading and extracting text...";

        const formData = new FormData();
        formData.append('file', file);
        formData.append('role', role);
        formData.append('benchmark', benchmark);

        try {
            // UX progress steps
            const progressSteps = [
                "Simulating ATS scan...",
                "Recruiter is skimming your profile...",
                "Hiring Manager deep-dive evaluation...",
                "Comparing against market competitors...",
                "Finalizing brutal breakdown..."
            ];
            
            let step = 0;
            const progressInt = setInterval(() => {
                if (step < progressSteps.length) {
                    statusText.textContent = progressSteps[step++];
                }
            }, 1800);

            const res = await fetch('/analyze-resume', {
                method: 'POST',
                body: formData
            });

            clearInterval(progressInt);

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Analysis failed");
            }

            const data = await res.json();
            
            // Save to in-memory state for dashboard persistence
            latestResumeAnalysis = {
                score: data.final_score * 10 || 85,
                verdict: data.hire_verdict || 'Excellent',
                impact: data.final_score >= 8 ? 'Strong' : 'Average',
                match: data.ats_simulation?.ats_pass_probability || 'High',
                ats: data.ats_simulation?.keyword_match_score || 85
            };

            renderResumeResults(data);

        } catch (err) {
            showToast(err.message);
            uploadZone.style.display = 'block';
        } finally {
            analysisStatus.style.display = 'none';
        }
    };

    const renderResumeResults = (data) => {
        analysisResults.style.display = 'block';
        
        // Final Score & Market Position
        document.getElementById('res-score-value').textContent = `${data.final_score || 0}/10`;
        document.getElementById('res-market').textContent = `Market: ${data.market_positioning || 'N/A'}`;
        
        // Verdict Pill
        const verdictPill = document.getElementById('res-verdict-pill');
        const hireVerdict = data.hire_verdict || 'No Hire';
        verdictPill.textContent = hireVerdict.toUpperCase();
        
        verdictPill.className = 'decision-pill';
        if (hireVerdict.toLowerCase().includes('hire') && !hireVerdict.toLowerCase().includes('no')) {
            verdictPill.classList.add('select');
        } else if (hireVerdict.toLowerCase().includes('borderline')) {
            verdictPill.classList.add('borderline');
        } else {
            verdictPill.classList.add('reject');
        }

        // Section Summaries
        document.getElementById('res-brutal-summary').textContent = data.brutal_analysis?.summary || '';
        document.getElementById('res-risk-text').textContent = data.rejection_risk?.reason || '';

        // Category Table
        const hmTable = document.getElementById('res-hm-table');
        hmTable.innerHTML = '';
        (data.category_breakdown || []).forEach(cat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${cat.category}</strong></td>
                <td>${cat.weight}</td>
                <td><span class="pill-badge">${cat.score}/10</span></td>
                <td>${cat.reason}</td>
            `;
            hmTable.appendChild(tr);
        });

        // ATS Stage
        document.getElementById('res-ats-match').textContent = `${data.ats_simulation?.keyword_match_score || 0}%`;
        document.getElementById('res-ats-prob').textContent = data.ats_simulation?.ats_pass_probability || 'Low';
        
        const atsMissing = document.getElementById('res-ats-missing');
        atsMissing.innerHTML = '';
        (data.ats_simulation?.missing_critical_keywords || []).forEach(kw => {
            const li = document.createElement('li');
            li.style.listStyle = 'none';
            li.innerHTML = `<span class="pill-badge" style="background:var(--danger-light); color:var(--danger);">${escapeHTML(kw)}</span>`;
            atsMissing.appendChild(li);
        });

        // Recruiter Stage
        document.getElementById('res-recruiter-impression').textContent = `"${data.recruiter_snap_judgment?.first_impression || ''}"`;
        const recruiterReasons = document.getElementById('res-recruiter-reasons');
        recruiterReasons.innerHTML = '';
        (data.recruiter_snap_judgment?.top_reasons || []).forEach(r => {
            const li = document.createElement('li');
            li.textContent = r;
            recruiterReasons.appendChild(li);
        });

        // What Works
        const worksList = document.getElementById('res-works-list');
        worksList.innerHTML = '';
        (data.what_works || []).forEach(w => {
            const li = document.createElement('li');
            li.textContent = w;
            worksList.appendChild(li);
        });

        // Action Projects
        const actionProjects = document.getElementById('res-action-projects');
        actionProjects.innerHTML = '';
        (data.action_plan?.project_ideas || []).forEach(p => {
            const div = document.createElement('div');
            div.className = 'action-box';
            div.innerHTML = `
                <h6 style="font-weight:700; font-size:0.85rem; margin-bottom:4px;">${escapeHTML(p.title)}</h6>
                <p style="font-size:0.75rem; color:var(--text-sub); margin-bottom:4px;"><strong>Stack:</strong> ${escapeHTML(p.stack)}</p>
                <p style="font-size:0.75rem; color:var(--text-sub);">${escapeHTML(p.description)}</p>
            `;
            actionProjects.appendChild(div);
        });

        // Action Tools
        const actionTools = document.getElementById('res-action-tools');
        actionTools.innerHTML = '';
        (data.action_plan?.tools_to_learn || []).forEach(t => {
            const li = document.createElement('li');
            li.textContent = t;
            actionTools.appendChild(li);
        });

        // Rewrite Examples
        const rewritesContainer = document.getElementById('res-action-rewrites');
        rewritesContainer.innerHTML = '';
        (data.action_plan?.bullet_rewrites || []).forEach(ex => {
            const item = document.createElement('div');
            item.className = 'rewrite-item';
            item.innerHTML = `
                <div class="rewrite-new">Improved: "${escapeHTML(ex.improved)}"</div>
                <div class="rewrite-orig">From: "${escapeHTML(ex.original)}"</div>
            `;
            rewritesContainer.appendChild(item);
        });

        showToast('Multi-stage analysis complete!');
    };

    // Event Listeners for Category Selection (Practice page)
    if (btnDsaCategory) btnDsaCategory.addEventListener('click', enterDsaPrep);
    if (btnResumeCategory) btnResumeCategory.addEventListener('click', enterResumeAnalyzer);
    if (backToCategoriesDsa) backToCategoriesDsa.addEventListener('click', showSelectionScreen);
    if (backToCategoriesResume) backToCategoriesResume.addEventListener('click', showSelectionScreen);

    // Resume Upload Events
    if (btnTriggerUpload) btnTriggerUpload.addEventListener('click', () => resumeUpload?.click());
    if (resumeUpload) {
        resumeUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleResumeAnalysis(e.target.files[0]);
        });
    }

    if (uploadZone) {
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleResumeAnalysis(e.dataTransfer.files[0]);
        });
    }

    if (companySearchInput) {
        companySearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allCompanies.filter(c => c.toLowerCase().includes(term));
            renderCompanies(filtered);
        });
    }

    if (backToCompanies) {
        backToCompanies.addEventListener('click', () => {
            if (questionsView) questionsView.style.display = 'none';
            if (companySelection) companySelection.style.display = 'block';
        });
    }

    // Event Listeners for search/forms
    if (ctaButton) ctaButton.addEventListener('click', handleSearch);
    if (skillInput) {
        skillInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    }

    if (tabPlaylists) tabPlaylists.addEventListener('click', () => renderStep('playlists'));
    if (tabCertificates) tabCertificates.addEventListener('click', () => renderStep('certificates'));
    if (tabRoadmap) tabRoadmap.addEventListener('click', () => renderStep('roadmap'));

    // ── Student Projects Management ──
    const projectsListContainer = document.getElementById('projects-list-container');
    const addProjectForm = document.getElementById('add-project-form');

    const defaultProjects = [
        { title: "Distributed Rate Limiter", category: "Backend", desc: "Build an API rate limiter service in Go/Python utilizing Redis token bucket algorithm." },
        { title: "Realtime Collaborative Editor", category: "Fullstack", desc: "Create a dynamic text editor using WebSockets and Operational Transformation patterns." }
    ];

    const loadProjects = async () => {
        if (!projectsListContainer) return;
        let projects = [...defaultProjects];

        try {
            const res = await fetch('/get-user-projects');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    projects = data;
                }
            }
        } catch (e) {
            console.error("Failed to load user projects from DB:", e);
        }

        renderProjectsList(projects);
    };

    const renderProjectsList = (projects) => {
        if (!projectsListContainer) return;
        projectsListContainer.innerHTML = projects.map((p, idx) => `
            <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 10px; border-left: 4px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: var(--text-main); font-size: 1.05rem;">${escapeHTML(p.title)}</strong>
                    <span style="background: rgba(37,99,235,0.1); color: var(--primary); font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; font-weight: 700;">${escapeHTML(p.category || 'Portfolio')}</span>
                </div>
                <p style="margin: 0; color: var(--text-sub); font-size: 0.85rem; line-height: 1.5;">${escapeHTML(p.desc || p.description || '')}</p>
            </div>
        `).join('');
    };

    const syncProjects = async (projects) => {
        try {
            await fetch('/sync-user-projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projects_list: projects })
            });
        } catch (e) {
            console.error("Failed to sync projects:", e);
        }
    };

    if (addProjectForm) {
        addProjectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('project-title-input')?.value.trim();
            const category = document.getElementById('project-category-input')?.value.trim();
            const desc = document.getElementById('project-desc-input')?.value.trim();

            if (!title || !desc) {
                showToast("Please provide project title and description.");
                return;
            }

            let currentProjects = [...defaultProjects];
            try {
                const res = await fetch('/get-user-projects');
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) currentProjects = data;
                }
            } catch (err) {}

            currentProjects.unshift({ title, category, desc });
            await syncProjects(currentProjects);
            renderProjectsList(currentProjects);
            showToast('Project added successfully!');
            addProjectForm.reset();
        });
    }

    // ── Sidebar Router Logic ──────────────────────────────────────
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    const views = document.querySelectorAll('.content-view');

    const switchView = (targetViewId) => {
        views.forEach(v => {
            v.classList.remove('active');
            if (v.id === targetViewId) {
                v.classList.add('active');
            }
        });

        if (targetViewId !== 'view-player') {
            if (typeof stopWatchTimers === 'function') stopWatchTimers();
            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                try { ytPlayer.pauseVideo(); } catch(e){}
            }
        }

        // Trigger view-specific dynamic logic
        if (targetViewId === 'view-dashboard') {
            updateCommandCenter();
        } else if (targetViewId === 'view-practice') {
            enterDsaPrep();
        } else if (targetViewId === 'view-resume') {
            enterResumeAnalyzer();
        } else if (targetViewId === 'view-learning') {
            resetViews();
            const learningView = document.getElementById('view-learning');
            if (learningView) learningView.classList.add('active');
            if (emptyState) emptyState.style.display = 'block';
        } else if (targetViewId === 'view-analytics') {
            renderAnalyticsCharts();
            initProfileMilestones();
        } else if (targetViewId === 'view-roadmaps') {
            renderDashboardRoadmap();
        } else if (targetViewId === 'view-settings') {
            initProfileMilestones();
            loadCodingProfiles();
        } else if (targetViewId === 'view-mentor') {
            loadCodingProfiles();
        } else if (targetViewId === 'view-interviews') {
            showToast('Mock Interviews are currently locked for platform updates.');
        }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const targetViewId = item.getAttribute('data-view');
            switchView(targetViewId);
        });
    });

    // Dashboard & Roadmaps View Actions
    const btnDashboardResume = document.getElementById('dashboard-improve-resume-btn');
    if (btnDashboardResume) {
        btnDashboardResume.addEventListener('click', () => {
            const resumeTabBtn = document.getElementById('btn-sidebar-resume');
            if (resumeTabBtn) resumeTabBtn.click();
        });
    }

    const btnDashboardCalendar = document.getElementById('dashboard-view-calendar-btn');
    if (btnDashboardCalendar) {
        btnDashboardCalendar.addEventListener('click', () => {
            const interviewTabBtn = document.getElementById('btn-sidebar-interviews');
            if (interviewTabBtn) interviewTabBtn.click();
        });
    }

    // Active Roadmap Dashboard Actions
    const untrackBtnDashboard = document.getElementById('btn-dashboard-untrack');
    if (untrackBtnDashboard) {
        untrackBtnDashboard.addEventListener('click', untrackRoadmapFlow);
    }
    const goLearningBtnDashboard = document.getElementById('btn-dashboard-go-learning');
    if (goLearningBtnDashboard) {
        goLearningBtnDashboard.addEventListener('click', () => {
            const learningTabBtn = document.getElementById('btn-sidebar-learning');
            if (learningTabBtn) learningTabBtn.click();
        });
    }

    // ── Dedicated Role Roadmaps Selection & Page Navigation ──
    // ── Dedicated Role Roadmaps Selection & Page Navigation ──
    const roleHeroDetails = {
        'fullstack': {
            title: 'Full Stack Developer',
            subtitle: "Here's a timeline of the Full Stack Developer journey.",
            rating: '4.9 (12.4K)',
            demandText: '+24.5% Growth',
            openingsText: '125,000+ Active Roles',
            salaryText: '₹8 – 24 LPA',
            accent1: '#a855f7',
            accent2: '#3b82f6',
            codeText: '</>',
            stages: [
                {
                    title: 'Frontend Fundamentals',
                    description: 'Master HTML5, CSS3, and JavaScript ES6+ to build responsive and interactive web interfaces.',
                    items: ['HTML5', 'CSS3', 'JavaScript', 'React', 'Tailwind CSS']
                },
                {
                    title: 'Git Fundamentals',
                    description: 'Learn the essential concepts and commands to manage code with Git effectively.',
                    items: ['Basic Git', 'Core Commands', 'Branching and Merging', 'Remote Repositories', 'Undoing Changes', 'Stashing', 'Tags', 'Collaboration', 'Advanced Essentials']
                },
                {
                    title: 'Backend Development',
                    description: 'Build server-side applications with Node.js, Express.js, and understand server architecture.',
                    items: ['Node.js', 'Express.js', 'Fastify', 'TypeScript', 'Python (FastAPI, Django)', 'Go (Gin)', 'REST APIs', 'GraphQL']
                },
                {
                    title: 'Advanced Git',
                    description: 'Master advanced Git workflows, rebasing, hooks, and CI/CD integration for production environments.',
                    items: ['GitHub', 'GitLab', 'Bitbucket', 'Git Hooks', 'GitHub Actions', 'Git Rebase', 'Git Cherry-pick', 'Git Bisect']
                },
                {
                    title: 'RESTful APIs',
                    description: 'Design and develop scalable REST APIs with proper HTTP methods, status codes, and documentation.',
                    items: ['Express.js', 'FastAPI', 'Postman', 'Swagger (OpenAPI)', 'JWT Authentication', 'OAuth 2.0', 'Rate Limiting', 'API Versioning']
                },
                {
                    title: 'Databases',
                    description: 'Work with SQL and NoSQL databases, design schemas, and optimize queries for performance.',
                    items: ['PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'Prisma ORM', 'Sequelize ORM', 'Mongoose', 'Database Indexing', 'ACID Transactions']
                },
                {
                    title: 'Deployment',
                    description: 'Deploy applications using Docker, cloud platforms, and implement CI/CD pipelines.',
                    items: ['AWS (EC2, S3, Lambda)', 'Vercel', 'Render', 'Railway', 'Docker Swarm', 'Nginx', 'CI/CD Pipelines', 'Monitoring (Prometheus, Grafana)']
                }
            ]
        },
        'aiml': {
            title: 'AI/ML Engineer',
            subtitle: "Here's a timeline of the AI/ML Engineer journey.",
            rating: '4.9 (15.8K)',
            demandText: '+74.2% Growth',
            openingsText: '85,000+ Active Roles',
            salaryText: '₹12 – 35 LPA',
            accent1: '#a855f7',
            accent2: '#ec4899',
            codeText: 'AI',
            stages: [
                {
                    title: 'Python & Math Foundations',
                    description: 'Master Python syntax, data structures, linear algebra, and statistical calculus.',
                    items: ['Python ES6+', 'Linear Algebra', 'Calculus & Optimization', 'Probability & Statistics', 'NumPy', 'Pandas', 'Matplotlib & Seaborn']
                },
                {
                    title: 'Machine Learning Core',
                    description: 'Understand supervised and unsupervised machine learning algorithms with Scikit-Learn.',
                    items: ['Scikit-Learn', 'Supervised Learning', 'Unsupervised Learning', 'Regression Models', 'Decision Trees', 'Random Forests', 'XGBoost', 'Model Evaluation Metrics']
                },
                {
                    title: 'Deep Learning & Neural Networks',
                    description: 'Design and train multi-layer neural networks using PyTorch and TensorFlow.',
                    items: ['PyTorch', 'TensorFlow & Keras', 'Convolutional Neural Networks (CNNs)', 'Recurrent Neural Networks (RNNs & LSTMs)', 'Transformers Architecture', 'Hyperparameter Tuning']
                },
                {
                    title: 'NLP & Computer Vision',
                    description: 'Process text, audio, image, and video data using cutting-edge deep learning frameworks.',
                    items: ['OpenCV', 'Hugging Face Transformers', 'Tokenization & Embeddings', 'BERT & T5 Models', 'Object Detection (YOLO)', 'Image Segmentation']
                },
                {
                    title: 'Generative AI & LLMs',
                    description: 'Build GenAI applications leveraging Large Language Models, RAG, and Vector Databases.',
                    items: ['LangChain', 'LlamaIndex', 'RAG Architecture', 'Pinecone Vector DB', 'ChromaDB', 'Prompt Engineering', 'Fine-Tuning (LoRA, PEFT)']
                },
                {
                    title: 'MLOps & Production Deployment',
                    description: 'Deploy, monitor, scale, and maintain machine learning pipelines in production.',
                    items: ['FastAPI', 'Docker Containerization', 'MLflow Tracking', 'Kubeflow Pipelines', 'Triton Inference Server', 'Model Drift Detection', 'CI/CD for Machine Learning']
                }
            ]
        },
        'data-analyst': {
            title: 'Data Analyst',
            subtitle: "Here's a timeline of the Data Analyst journey.",
            rating: '4.8 (9.6K)',
            demandText: '+21.8% Growth',
            openingsText: '95,000+ Active Roles',
            salaryText: '₹6 – 18 LPA',
            accent1: '#10b981',
            accent2: '#3b82f6',
            codeText: 'SQL',
            stages: [
                {
                    title: 'Spreadsheets & Data Foundations',
                    description: 'Clean raw datasets and build foundational reports using Microsoft Excel and Google Sheets.',
                    items: ['Advanced Excel', 'Pivot Tables & Charts', 'VLOOKUP & XLOOKUP', 'Data Cleaning', 'Descriptive Statistics']
                },
                {
                    title: 'SQL & Relational Databases',
                    description: 'Query, join, aggregate, and manipulate complex enterprise data stored in relational databases.',
                    items: ['Basic SQL Queries', 'Joins & Unions', 'Group By & Aggregations', 'Subqueries', 'Window Functions', 'Database Schema Design']
                },
                {
                    title: 'Data Visualization & BI Tools',
                    description: 'Transform complex analysis into interactive dashboards for stakeholders.',
                    items: ['Power BI', 'DAX Formulas', 'Tableau Desktop', 'Chart Selection Strategy', 'Interactive Dashboards', 'Data Storytelling']
                },
                {
                    title: 'Python for Data Analysis',
                    description: 'Automate data processing workflows and perform exploratory data analysis.',
                    items: ['Python (Pandas)', 'NumPy Operations', 'Matplotlib & Seaborn', 'Jupyter Notebooks', 'Exploratory Data Analysis (EDA)']
                },
                {
                    title: 'Business & Statistical Analysis',
                    description: 'Derive actionable business insights using statistical hypothesis testing and cohort analysis.',
                    items: ['A/B Testing', 'Hypothesis Testing', 'Cohort Analysis', 'Customer Churn Analysis', 'KPI Dashboard Reporting']
                }
            ]
        },
        'data-scientist': {
            title: 'Data Scientist',
            subtitle: "Here's a timeline of the Data Scientist journey.",
            rating: '4.9 (11.2K)',
            demandText: '+35.4% Growth',
            openingsText: '70,000+ Active Roles',
            salaryText: '₹10 – 30 LPA',
            accent1: '#f59e0b',
            accent2: '#ef4444',
            codeText: 'ML',
            stages: [
                {
                    title: 'Programming & Mathematics',
                    description: 'Master mathematical foundations, linear algebra, probability, and numerical computing.',
                    items: ['Python (NumPy, SciPy)', 'Linear Algebra', 'Multivariable Calculus', 'Probability Distributions', 'Bayesian Statistics']
                },
                {
                    title: 'Data Wrangling & Feature Engineering',
                    description: 'Clean, preprocess, and engineer features from unstructured enterprise data.',
                    items: ['Advanced SQL', 'Pandas Manipulation', 'Feature Selection & Extraction', 'Missing Value Imputation', 'Data Normalization']
                },
                {
                    title: 'Predictive Modeling & Machine Learning',
                    description: 'Train regression, classification, clustering, and time-series forecasting models.',
                    items: ['Scikit-Learn', 'Statistical Inference', 'Time Series (ARIMA, Prophet)', 'Random Forest & XGBoost', 'Cross-Validation']
                },
                {
                    title: 'Deep Learning & Big Data Analytics',
                    description: 'Scale analytics to massive datasets using PySpark and deep learning architectures.',
                    items: ['PyTorch', 'Apache Spark', 'PySpark', 'Google BigQuery', 'Distributed Systems', 'Deep Neural Networks']
                },
                {
                    title: 'Model Interpretability & MLOps',
                    description: 'Explain AI decision-making models and deploy microservices to cloud APIs.',
                    items: ['SHAP & LIME Interpretability', 'Model Evaluation Metrics', 'FastAPI', 'Docker', 'Model Drift Monitoring']
                }
            ]
        },
        'devops': {
            title: 'DevOps Engineer',
            subtitle: "Here's a timeline of the DevOps Engineer journey.",
            rating: '4.9 (8.4K)',
            demandText: '+31.2% Growth',
            openingsText: '80,000+ Active Roles',
            salaryText: '₹9 – 28 LPA',
            accent1: '#6366f1',
            accent2: '#0ea5e9',
            codeText: 'K8S',
            stages: [
                {
                    title: 'Linux & Scripting',
                    description: 'Administer Linux server environments and automate tasks with Bash and Python scripting.',
                    items: ['Linux Server Administration', 'Bash Shell Scripting', 'Python Automation', 'Networking (TCP/IP, DNS)', 'SSH & Key Management']
                },
                {
                    title: 'Version Control & Workflow',
                    description: 'Manage production code repositories and team branching strategies with Git.',
                    items: ['Git Core Commands', 'GitHub / GitLab', 'Branching & Rebase Strategies', 'Git Hooks', 'Code Reviews & PR Workflows']
                },
                {
                    title: 'Containerization',
                    description: 'Package applications into reproducible, isolated containers with Docker.',
                    items: ['Docker Engine', 'Dockerfile Optimization', 'Docker Compose', 'Container Security', 'Container Registries (ECR/DockerHub)']
                },
                {
                    title: 'CI/CD Automation',
                    description: 'Automate software build, test, and release pipelines.',
                    items: ['GitHub Actions', 'Jenkins Pipelines', 'GitLab CI/CD', 'Automated Testing', 'Artifact Management']
                },
                {
                    title: 'Infrastructure as Code (IaC)',
                    description: 'Provision, configure, and manage cloud infrastructure declarative scripts.',
                    items: ['Terraform', 'Ansible Configuration', 'AWS CloudFormation', 'Infrastructure State Management', 'Modular Infrastructure']
                },
                {
                    title: 'Kubernetes & Cloud Orchestration',
                    description: 'Orchestrate scalable microservices across enterprise Kubernetes clusters.',
                    items: ['Kubernetes Core Objects', 'Helm Charts', 'Ingress Controllers', 'AWS EKS / GCP GKE', 'Cluster Scaling']
                },
                {
                    title: 'Monitoring & Observability',
                    description: 'Track infrastructure metrics, analyze system logs, and set up alerts.',
                    items: ['Prometheus', 'Grafana Dashboards', 'ELK Stack (Elasticsearch, Logstash, Kibana)', 'Alertmanager', 'Tracing (Jaeger)']
                }
            ]
        },
        'cybersecurity': {
            title: 'Cybersecurity Specialist',
            subtitle: "Here's a timeline of the Cybersecurity Specialist journey.",
            rating: '4.8 (7.9K)',
            demandText: '+32.7% Growth',
            openingsText: '65,000+ Active Roles',
            salaryText: '₹10 – 32 LPA',
            accent1: '#ef4444',
            accent2: '#f59e0b',
            codeText: 'SEC',
            stages: [
                {
                    title: 'Networking & Systems Fundamentals',
                    description: 'Understand low-level networking protocols, OS security, and system architecture.',
                    items: ['Network Protocols (TCP/IP, UDP)', 'Wireshark Packet Analysis', 'Linux Hardening', 'Windows Administration', 'Firewalls & VPNs']
                },
                {
                    title: 'Cryptography & Security Policies',
                    description: 'Implement encryption, public key infrastructure, and enterprise security governance.',
                    items: ['Symmetric & Asymmetric Encryption', 'PKI & SSL/TLS Certificates', 'Identity & Access Management (IAM)', 'Multi-Factor Authentication (MFA)', 'Security Policies & Frameworks']
                },
                {
                    title: 'Penetration Testing & Ethical Hacking',
                    description: 'Assess security postures by discovering and exploiting vulnerabilities ethically.',
                    items: ['Nmap Reconnaissance', 'Metasploit Framework', 'Burp Suite', 'OWASP Top 10 Web Vulnerabilities', 'Vulnerability Scanners']
                },
                {
                    title: 'Security Operations & SIEM',
                    description: 'Monitor threat activity, analyze security logs, and respond to real-time incidents.',
                    items: ['SIEM Tools (Splunk, Elastic)', 'SOC Operations', 'Incident Response Playbooks', 'Log Analysis', 'Endpoint Detection & Response (EDR)']
                },
                {
                    title: 'Cloud & Enterprise Security',
                    description: 'Secure cloud environments, zero-trust architectures, and ensure regulatory compliance.',
                    items: ['Cloud Security (AWS/Azure)', 'Zero Trust Architecture', 'Compliance (ISO 27001, SOC 2)', 'Threat Intelligence', 'Container Security']
                }
            ]
        },
        'frontend': {
            title: 'Frontend Development',
            subtitle: "Here's a timeline of the Frontend Development learning path.",
            rating: '4.9 (14.2K)',
            demandText: '+28.4% Growth',
            openingsText: '110,000+ Active Roles',
            salaryText: '₹6 – 20 LPA',
            accent1: '#3b82f6',
            accent2: '#06b6d4',
            codeText: 'HTML',
            stages: [
                {
                    title: 'Web Fundamentals',
                    description: 'Master HTML5 semantic elements, modern CSS layout techniques, and responsive web design principles.',
                    items: ['HTML5 Semantics', 'CSS3 & Flexbox', 'CSS Grid', 'Responsive Web Design', 'CSS Variables & Themes']
                },
                {
                    title: 'Core JavaScript (ES6+)',
                    description: 'Build interactive applications with modern JavaScript, DOM manipulation, and asynchronous programming.',
                    items: ['ES6+ Syntax & Scope', 'DOM Manipulation', 'Event Handling', 'Promises & Async/Await', 'Fetch API & JSON']
                },
                {
                    title: 'CSS Frameworks & Tooling',
                    description: 'Speed up interface development using modern utility-first CSS frameworks and preprocessors.',
                    items: ['Tailwind CSS', 'Sass/SCSS', 'CSS Modules', 'Styled Components', 'Vite & Build Tools']
                },
                {
                    title: 'Frontend Framework (React)',
                    description: 'Develop modular component architecture, handle application state, and manage navigation.',
                    items: ['React JSX & Components', 'State & Props', 'React Hooks (useState, useEffect)', 'Context API', 'React Router v6']
                },
                {
                    title: 'Advanced React & Next.js',
                    description: 'Leverage Server-Side Rendering (SSR), Static Site Generation (SSG), and global state management.',
                    items: ['Next.js App Router', 'React Server Components', 'SSR & SSG', 'Redux Toolkit / Zustand', 'TypeScript integration']
                },
                {
                    title: 'Testing & Performance Optimization',
                    description: 'Ensure application quality with unit testing, accessibility standards, and web performance audits.',
                    items: ['Lighthouse Audits', 'Core Web Vitals', 'Jest & React Testing Library', 'Web Accessibility (WCAG)', 'Bundle Size Optimization']
                }
            ]
        },
        'backend': {
            title: 'Backend Development',
            subtitle: "Here's a timeline of the Backend Development learning path.",
            rating: '4.9 (11.8K)',
            demandText: '+26.8% Growth',
            openingsText: '98,000+ Active Roles',
            salaryText: '₹7 – 22 LPA',
            accent1: '#10b981',
            accent2: '#0284c7',
            codeText: 'NODE',
            stages: [
                {
                    title: 'Server Fundamentals & Runtimes',
                    description: 'Understand server-side execution environments, HTTP protocols, asynchronous event loops, and streams.',
                    items: ['Node.js Architecture', 'Event Loop & Non-Blocking I/O', 'HTTP / HTTPS Protocols', 'Node File System & Streams', 'Environment Configuration']
                },
                {
                    title: 'Web Frameworks & REST APIs',
                    description: 'Design and build modular RESTful web APIs with robust routing and middleware logic.',
                    items: ['Express.js', 'RESTful API Standards', 'Custom Middleware', 'Request Validation & Sanitization', 'TypeScript for Backend']
                },
                {
                    title: 'Databases & ORMs',
                    description: 'Model relational and document-oriented databases, write efficient queries, and leverage ORMs.',
                    items: ['PostgreSQL', 'MongoDB', 'Prisma ORM', 'Mongoose ODM', 'Database Indexing & Transactions']
                },
                {
                    title: 'Authentication & Security',
                    description: 'Implement enterprise authentication mechanisms, token authorization, and security best practices.',
                    items: ['JWT Tokens', 'OAuth 2.0', 'Password Hashing (bcrypt)', 'CORS & Rate Limiting', 'OWASP API Security']
                },
                {
                    title: 'Caching & Asynchronous Processing',
                    description: 'Optimize API response times with in-memory caching and manage background job queues.',
                    items: ['Redis Caching Strategies', 'Background Job Queues (BullMQ)', 'Message Queues (RabbitMQ)', 'WebSocket Live Connections', 'API Rate Limiting']
                },
                {
                    title: 'Testing & Container Deployment',
                    description: 'Write integration test suites, containerize applications, and automate deployment pipelines.',
                    items: ['Jest & Supertest API Testing', 'Docker Containerization', 'CI/CD GitHub Actions', 'Cloud Deployment (Render/AWS)', 'Logging & Health Monitoring']
                }
            ]
        },
        'python-dev': {
            title: 'Python Mastery',
            subtitle: "Here's a timeline of the Python Developer learning path.",
            rating: '4.9 (16.5K)',
            demandText: '+42.1% Growth',
            openingsText: '140,000+ Active Roles',
            salaryText: '₹8 – 25 LPA',
            accent1: '#f59e0b',
            accent2: '#3b82f6',
            codeText: 'PY',
            stages: [
                {
                    title: 'Python Syntax & Foundations',
                    description: 'Master core Python language syntax, built-in data types, and control structures.',
                    items: ['Python Variables & Types', 'Lists, Dicts, Sets & Tuples', 'Control Flow & Loops', 'Functions & Lambda Expressions', 'File I/O & Exception Handling']
                },
                {
                    title: 'Advanced Python Programming',
                    description: 'Understand object-oriented principles, metaprogramming decorators, and generator streams.',
                    items: ['OOP (Classes & Inheritance)', 'Python Decorators', 'Generators & Iterators', 'Context Managers', 'Package Management (Poetry/Pip)']
                },
                {
                    title: 'Data Structures & Algorithms',
                    description: 'Implement fundamental computer science algorithms and data structures using Python.',
                    items: ['Time & Space Complexity (Big-O)', 'Sorting & Searching Algorithms', 'Recursion & Dynamic Programming', 'Trees & Graph Traversal', 'LeetCode Python Problem Solving']
                },
                {
                    title: 'Backend Web Frameworks',
                    description: 'Build modern high-performance microservices and web APIs using FastAPI and Django.',
                    items: ['FastAPI Microservices', 'Pydantic Data Validation', 'Django Web Framework', 'Django REST Framework', 'SQLAlchemy ORM']
                },
                {
                    title: 'Asynchronous & Concurrent Python',
                    description: 'Handle high-concurrency workloads using async/await syntax and multi-process workers.',
                    items: ['AsyncIO Core', 'Async HTTP (httpx)', 'WebSockets in Python', 'Multiprocessing & Threading', 'Celery Distributed Tasks']
                },
                {
                    title: 'Code Quality & Production Ops',
                    description: 'Maintain clean, type-checked Python codebases with automated testing and continuous integration.',
                    items: ['PyTest Unit Testing', 'Type Hinting (mypy)', 'Code Formatting (Black/Flake8)', 'Dockerizing Python Apps', 'Production Deployment']
                }
            ]
        },
        'java-dev': {
            title: 'Java & Spring Boot',
            subtitle: "Here's a timeline of the Java & Spring Boot learning path.",
            rating: '4.8 (10.4K)',
            demandText: '+22.4% Growth',
            openingsText: '115,000+ Active Roles',
            salaryText: '₹7 – 24 LPA',
            accent1: '#ef4444',
            accent2: '#f59e0b',
            codeText: 'JAVA',
            stages: [
                {
                    title: 'Java Language Core',
                    description: 'Master object-oriented programming concepts, Java memory management, and collection interfaces.',
                    items: ['Java OOP Concepts', 'Collections Framework', 'Generics & Enums', 'Exception Handling', 'Streams & Lambda Expressions']
                },
                {
                    title: 'JVM Internals & Multithreading',
                    description: 'Understand how the Java Virtual Machine executes bytecode and write thread-safe concurrent applications.',
                    items: ['JVM Memory & Garbage Collection', 'Multithreading Core', 'Java Concurrency Utilities', 'JVM Profiling & Tuning', 'File I/O & NIO']
                },
                {
                    title: 'Data Persistence & Hibernate ORM',
                    description: 'Interface Java applications with relational SQL databases using JPA and Hibernate.',
                    items: ['JDBC Fundamentals', 'Hibernate ORM', 'JPA Specifications', 'Entity Relationships (1:N, N:M)', 'JPQL & Native Queries']
                },
                {
                    title: 'Spring Framework Core',
                    description: 'Leverage Dependency Injection and Inversion of Control to structure enterprise backend services.',
                    items: ['Spring Core & IoC', 'Dependency Injection', 'Spring MVC Architecture', 'Spring Data JPA', 'Spring Beans & Configuration']
                },
                {
                    title: 'Spring Boot Microservices',
                    description: 'Develop cloud-native microservices with Spring Security, REST controllers, and messaging.',
                    items: ['Spring Boot REST APIs', 'Spring Security & JWT', 'Actuator Health Metrics', 'Spring Cloud & Eureka', 'Apache Kafka Integration']
                },
                {
                    title: 'Testing & Industrial DevOps',
                    description: 'Ensure enterprise stability using JUnit test suites, Maven build automation, and Docker packaging.',
                    items: ['JUnit 5 & Mockito', 'Maven & Gradle Builds', 'Docker Containerization', 'CI/CD Pipelines', 'SonarQube Quality Gate']
                }
            ]
        },
        'react-dev': {
            title: 'React & Next.js',
            subtitle: "Here's a timeline of the React & Next.js learning path.",
            rating: '4.9 (18.1K)',
            demandText: '+38.6% Growth',
            openingsText: '135,000+ Active Roles',
            salaryText: '₹7 – 24 LPA',
            accent1: '#06b6d4',
            accent2: '#3b82f6',
            codeText: 'REACT',
            stages: [
                {
                    title: 'React Core Architecture',
                    description: 'Understand Virtual DOM reconciliation, JSX templating, component lifecycle, and unidirectional data flow.',
                    items: ['JSX & Component Props', 'State vs Props', 'Event Handling', 'Conditional Rendering', 'Keys & List Rendering']
                },
                {
                    title: 'React Hooks Deep Dive',
                    description: 'Master built-in React hooks to manage side effects, DOM references, and performance memoization.',
                    items: ['useState & useEffect', 'useRef & DOM Manipulation', 'useMemo & useCallback', 'useReducer Pattern', 'Custom React Hooks']
                },
                {
                    title: 'Global State & Data Fetching',
                    description: 'Handle complex application state and server caching across multi-page web applications.',
                    items: ['React Context API', 'Redux Toolkit (RTK)', 'Zustand State Store', 'TanStack React Query', 'SWR Cache Management']
                },
                {
                    title: 'Form Handling & Styling Systems',
                    description: 'Build validated user forms and implement sleek component design systems.',
                    items: ['React Hook Form', 'Zod Schema Validation', 'Tailwind CSS', 'Shadcn UI & Radix Primitives', 'Framer Motion Animations']
                },
                {
                    title: 'Next.js 14 App Router',
                    description: 'Master modern full-stack React with Next.js Server Components, Server Actions, and file-based routing.',
                    items: ['Next.js App Router', 'React Server Components (RSC)', 'Server Actions', 'SSR & Static Generation', 'API Routes & Middleware']
                },
                {
                    title: 'Testing & Production Optimization',
                    description: 'Write robust component test suites and optimize web vitals for search engines and user speed.',
                    items: ['React Testing Library', 'Jest Test Runner', 'Playwright E2E Testing', 'Code Splitting & Lazy Loading', 'SEO & OpenGraph Tags']
                }
            ]
        },
        'system-design': {
            title: 'System Design & Architecture',
            subtitle: "Here's a timeline of the System Design & Architecture learning path.",
            rating: '4.9 (20.3K)',
            demandText: '+52.4% Growth',
            openingsText: '60,000+ Active Senior Roles',
            salaryText: '₹18 – 45 LPA',
            accent1: '#a855f7',
            accent2: '#ec4899',
            codeText: 'SYS',
            stages: [
                {
                    title: 'Architectural Foundations',
                    description: 'Understand client-server interaction models, network protocols, latency benchmarks, and the CAP theorem.',
                    items: ['Client-Server Architecture', 'HTTP/HTTPS, WebSockets, gRPC', 'Latency vs Throughput', 'CAP Theorem & PACELC', 'SLA / SLO Metric Guarantees']
                },
                {
                    title: 'Scalability & Load Balancing',
                    description: 'Design stateless horizontal scaling architectures and configure high-performance load balancers.',
                    items: ['Horizontal vs Vertical Scaling', 'Nginx & HAProxy Load Balancers', 'Round Robin & Least Connection Algorithms', 'Content Delivery Networks (CDNs)', 'DNS Routing & Anycast']
                },
                {
                    title: 'Caching & Memory Optimization',
                    description: 'Implement distributed multi-layer caching architectures to handle millions of queries per second.',
                    items: ['Redis & Memcached', 'Cache Eviction (LRU/LFU)', 'Cache Strategies (Read-Through, Write-Back)', 'Cache Penetration & Stampede Protection', 'Distributed Cache Clusters']
                },
                {
                    title: 'Database Partitioning & Sharding',
                    description: 'Scale storage layers horizontally using relational read-replicas, sharding, and NoSQL databases.',
                    items: ['Database Replication (Master-Slave)', 'Consistent Hashing Algorithms', 'Database Sharding Strategies', 'SQL vs NoSQL Tradeoffs', 'Distributed Transactions (Saga Pattern)']
                },
                {
                    title: 'Asynchronous Messaging & Streams',
                    description: 'Decouple microservices using distributed event streams and pub/sub message brokers.',
                    items: ['Apache Kafka Event Streaming', 'RabbitMQ Message Queues', 'Event-Driven Microservices', 'Idempotent Consumer Logic', 'Dead Letter Queues']
                },
                {
                    title: 'High Availability & Observability',
                    description: 'Protect distributed systems from cascading failures with circuit breakers, rate limiters, and telemetry.',
                    items: ['Token Bucket Rate Limiting', 'Circuit Breakers (Resilience4j)', 'Distributed Tracing (Jaeger)', 'Prometheus & Grafana Telemetry', 'Disaster Recovery & Failover']
                }
            ]
        },
        'data-engineering': {
            title: 'Data Engineering',
            subtitle: "Here's a timeline of the Data Engineering learning path.",
            rating: '4.8 (8.7K)',
            demandText: '+34.2% Growth',
            openingsText: '75,000+ Active Roles',
            salaryText: '₹9 – 28 LPA',
            accent1: '#6366f1',
            accent2: '#06b6d4',
            codeText: 'ETL',
            stages: [
                {
                    title: 'Data Engineering Foundations',
                    description: 'Master core SQL query optimization, Python data processing scripts, and Linux shell automation.',
                    items: ['Advanced SQL Queries', 'Python Data Processing', 'Bash Shell Scripting', 'Git Version Control', 'Data Warehousing Concepts']
                },
                {
                    title: 'Data Modeling & Warehousing',
                    description: 'Design enterprise data warehouse schemas, star schemas, and columnar database tables.',
                    items: ['Star & Snowflake Schemas', 'Snowflake Data Cloud', 'Google BigQuery', 'Columnar File Formats (Parquet, ORC)', 'Data Vault Modeling']
                },
                {
                    title: 'Distributed Big Data Computing',
                    description: 'Process massive datasets across multi-node clusters using Apache Spark and PySpark.',
                    items: ['Apache Spark Core', 'PySpark DataFrames', 'Spark SQL & Optimizations', 'Distributed Storage (S3/HDFS)', 'Delta Lake Format']
                },
                {
                    title: 'Data Pipeline Orchestration',
                    description: 'Build, schedule, and monitor automated ETL/ELT data pipelines using Apache Airflow.',
                    items: ['Apache Airflow DAG Design', 'Airflow Operators & Sensors', 'Task Dependency Graphs', 'Data Build Tool (dbt)', 'Error Handling & Retries']
                },
                {
                    title: 'Real-Time Data Streaming',
                    description: 'Ingest and analyze continuous real-time data streams using Kafka and Spark Streaming.',
                    items: ['Apache Kafka Ingestion', 'Kafka Connect Framework', 'Spark Structured Streaming', 'Event Stream Schema Registry', 'Real-Time Analytics']
                },
                {
                    title: 'Data Governance & MLOps Infrastructure',
                    description: 'Enforce data quality standards, cataloging, lineage tracking, and CI/CD for data teams.',
                    items: ['Great Expectations (Data Quality)', 'Data Lineage & Cataloging', 'CI/CD for Data Pipelines', 'Data Mesh Principles', 'Data Security & Access Controls']
                }
            ]
        },
        'mobile-dev': {
            title: 'Mobile App Development',
            subtitle: "Here's a timeline of the Mobile App Development learning path.",
            rating: '4.8 (9.1K)',
            demandText: '+24.1% Growth',
            openingsText: '82,000+ Active Roles',
            salaryText: '₹6 – 22 LPA',
            accent1: '#ec4899',
            accent2: '#a855f7',
            codeText: 'APP',
            stages: [
                {
                    title: 'Mobile Programming Languages',
                    description: 'Master core mobile programming languages for cross-platform and native app development.',
                    items: ['TypeScript / JavaScript (React Native)', 'Dart (Flutter Framework)', 'Kotlin (Android Native)', 'Swift (iOS Native Basics)']
                },
                {
                    title: 'Mobile UI Layouts & Navigation',
                    description: 'Design intuitive, responsive mobile interfaces with touch interactions and smooth page transitions.',
                    items: ['Mobile Flexbox & Layouts', 'Stack & Tab Navigators', 'Custom Mobile Animations', 'Dark Mode & Theme Systems', 'Responsive Screen Scaling']
                },
                {
                    title: 'Native Device Features & APIs',
                    description: 'Interface with mobile hardware including camera, GPS, biometric sensors, and local storage.',
                    items: ['Camera & Image Picker', 'Geolocation & Maps API', 'Push Notifications (FCM)', 'Local Storage (AsyncStorage/SQLite)', 'Biometric Auth (FaceID/Fingerprint)']
                },
                {
                    title: 'State Management & Networking',
                    description: 'Handle app state, network caching, offline data synchronization, and REST/GraphQL APIs.',
                    items: ['Redux Toolkit / Zustand Store', 'TanStack Query (React Query)', 'REST & GraphQL API Consumption', 'Offline Data Synchronization', 'Network State Listeners']
                },
                {
                    title: 'Mobile Security & Testing',
                    description: 'Secure sensitive user credentials, prevent app reverse engineering, and write automated tests.',
                    items: ['Secure Storage (Keychain/Keystore)', 'App Pinning & SSL Security', 'Unit & Integration Testing', 'Detox / Appium E2E Testing', 'Crash Analytics (Crashlytics)']
                },
                {
                    title: 'App Store Build & Publishing',
                    description: 'Build, sign, and publish production applications to Google Play Store and Apple App Store.',
                    items: ['Android Release Bundles (AAB)', 'iOS Xcode Signing & Provisioning', 'Google Play Console Release', 'Apple App Store Connect', 'Fastlane Automation & OTA Updates']
                }
            ]
        }
    };

    /* ==========================================================================
       AAA CINEMATIC EXPERIENCE: HTML5 CANVAS 2D PYTHON GROWTH ENGINE
       ========================================================================== */
    class AAAPythonCanvasEngine {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.dpr = window.devicePixelRatio || 1;
            this.width = 230;
            this.height = 230;
            this.canvas.width = this.width * this.dpr;
            this.canvas.height = this.height * this.dpr;
            this.ctx.scale(this.dpr, this.dpr);

            this.currentProgress = 0.05;
            this.targetProgress = 0.05;
            this.time = 0;
            this.lastTime = performance.now();
            this.fps = 60;
            this.frameCount = 0;

            // Interaction Mouse state
            this.mouse = { x: 115, y: 115, targetX: 115, targetY: 115, isHovered: false };

            // Bioluminescent Spore Particles (36 active particles)
            this.particles = Array.from({ length: 36 }, () => ({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: -0.2 - Math.random() * 0.5,
                size: 1.2 + Math.random() * 2.4,
                hue: Math.random() > 0.5 ? 42 : 155, // Gold vs Emerald
                alpha: 0.2 + Math.random() * 0.7,
                pulseSpeed: 1 + Math.random() * 2
            }));

            // Volumetric Fog Clouds (5 procedural fog paths)
            this.fogClouds = Array.from({ length: 5 }, (_, i) => ({
                x: i * 50,
                y: 40 + i * 35,
                r: 60 + Math.random() * 40,
                speed: 0.15 + Math.random() * 0.2,
                alpha: 0.12 + Math.random() * 0.1
            }));

            // Audio hooks state flag tracker
            this.audioState = { eggCracked: false, hatched: false, juvenileGrow: false, adultAchieved: false };

            this.bindEvents();
            this.start();
        }

        bindEvents() {
            if (!this.canvas) return;
            this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.mouse.targetX = e.clientX - rect.left;
                this.mouse.targetY = e.clientY - rect.top;
                this.mouse.isHovered = true;
            });
            this.canvas.addEventListener('mouseleave', () => {
                this.mouse.targetX = 115;
                this.mouse.targetY = 115;
                this.mouse.isHovered = false;
            });
        }

        setTargetProgress(p) {
            this.targetProgress = Math.max(0.02, Math.min(1, p));
        }

        triggerAudioHook(eventName) {
            if (typeof window.playPythonSound === 'function') {
                try { window.playPythonSound(eventName); } catch(e) {}
            }
        }

        update() {
            const now = performance.now();
            const dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            this.time += dt;

            // Ultra-smooth progress lerp (0.06 for buttery inertia)
            this.currentProgress += (this.targetProgress - this.currentProgress) * 0.06;

            // Mouse smooth lerp
            this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.1;
            this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.1;

            // Sound triggers based on progress milestones
            if (this.currentProgress >= 0.18 && !this.audioState.eggCracked) {
                this.audioState.eggCracked = true;
                this.triggerAudioHook('eggCrack');
            }
            if (this.currentProgress >= 0.28 && !this.audioState.hatched) {
                this.audioState.hatched = true;
                this.triggerAudioHook('hatch');
            }
            if (this.currentProgress >= 0.55 && !this.audioState.juvenileGrow) {
                this.audioState.juvenileGrow = true;
                this.triggerAudioHook('hiss');
            }
            if (this.currentProgress >= 0.80 && !this.audioState.adultAchieved) {
                this.audioState.adultAchieved = true;
                this.triggerAudioHook('pulse');
            }

            // Particle physics
            this.particles.forEach(p => {
                p.x += p.vx + Math.sin(this.time * p.pulseSpeed) * 0.2;
                p.y += p.vy;
                if (p.y < -10) {
                    p.y = this.height + 10;
                    p.x = Math.random() * this.width;
                }
                if (this.mouse.isHovered) {
                    const dx = p.x - this.mouse.x;
                    const dy = p.y - this.mouse.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 45) {
                        p.x += (dx / dist) * 1.5;
                        p.y += (dy / dist) * 1.5;
                    }
                }
            });

            // Fog Cloud Movement
            this.fogClouds.forEach(c => {
                c.x += c.speed;
                if (c.x - c.r > this.width) c.x = -c.r;
            });
        }

        render() {
            const ctx = this.ctx;
            const w = this.width;
            const h = this.height;
            const p = this.currentProgress;

            ctx.clearRect(0, 0, w, h);

            // Parallax shift calculation from mouse
            const shiftX = (this.mouse.x - 115) * 0.08;
            const shiftY = (this.mouse.y - 115) * 0.08;

            // 1. Deep Volumetric Background
            const bgGrad = ctx.createRadialGradient(115 + shiftX, 115 + shiftY, 10, 115, 115, 140);
            bgGrad.addColorStop(0, 'rgba(26, 38, 64, 0.95)');
            bgGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.98)');
            bgGrad.addColorStop(1, 'rgba(9, 14, 26, 1)');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, w, h);

            // Volumetric Fog Clouds
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            this.fogClouds.forEach(c => {
                const fogG = ctx.createRadialGradient(c.x + shiftX * 0.5, c.y + shiftY * 0.5, 0, c.x, c.y, c.r);
                fogG.addColorStop(0, `rgba(${p > 0.5 ? '16,185,129' : '245,158,11'}, ${c.alpha})`);
                fogG.addColorStop(1, 'rgba(15,23,42,0)');
                ctx.fillStyle = fogG;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();

            // 2. Ambient Bioluminescent Spores
            this.particles.forEach(pt => {
                const alpha = pt.alpha * (0.6 + Math.sin(this.time * pt.pulseSpeed) * 0.4);
                ctx.fillStyle = `hsla(${pt.hue}, 90%, 65%, ${alpha})`;
                ctx.beginPath();
                ctx.arc(pt.x + shiftX * 0.3, pt.y + shiftY * 0.3, pt.size, 0, Math.PI * 2);
                ctx.fill();
            });

            // Nest Base (Always present at bottom)
            this.drawNestBase(ctx, shiftX, shiftY, p);

            // 3. Seamless Cross-Fade & Scale Morphing Between Stages
            const w1 = Math.max(0, Math.min(1, 1 - (p - 0.16) / 0.16));
            
            const w2In = Math.max(0, Math.min(1, (p - 0.16) / 0.12));
            const w2Out = Math.max(0, Math.min(1, 1 - (p - 0.42) / 0.16));
            const w2 = w2In * w2Out;

            const w3In = Math.max(0, Math.min(1, (p - 0.42) / 0.14));
            const w3Out = Math.max(0, Math.min(1, 1 - (p - 0.68) / 0.16));
            const w3 = w3In * w3Out;

            const w4 = Math.max(0, Math.min(1, (p - 0.68) / 0.15));

            if (w1 > 0.001) {
                ctx.save();
                ctx.globalAlpha = w1;
                this.drawStage1Egg(ctx, shiftX, shiftY, p);
                ctx.restore();
            }

            if (w2 > 0.001) {
                ctx.save();
                ctx.globalAlpha = w2;
                const scale2 = 0.65 + w2In * 0.35;
                ctx.translate(115, 115);
                ctx.scale(scale2, scale2);
                ctx.translate(-115, -115);
                this.drawStage2Hatchling(ctx, shiftX, shiftY, p);
                ctx.restore();
            }

            if (w3 > 0.001) {
                ctx.save();
                ctx.globalAlpha = w3;
                const scale3 = 0.75 + w3In * 0.25;
                ctx.translate(115, 115);
                ctx.scale(scale3, scale3);
                ctx.translate(-115, -115);
                this.drawStage3Juvenile(ctx, shiftX, shiftY, p);
                ctx.restore();
            }

            if (w4 > 0.001) {
                ctx.save();
                ctx.globalAlpha = w4;
                const scale4 = 0.8 + w4 * 0.2;
                ctx.translate(115, 115);
                ctx.scale(scale4, scale4);
                ctx.translate(-115, -115);
                this.drawStage4Adult(ctx, shiftX, shiftY, p);
                ctx.restore();
            }
        }

        drawNestBase(ctx, sx, sy, p) {
            ctx.save();
            ctx.translate(115 + sx * 0.4, 185 + sy * 0.4);
            
            const nestGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 45);
            nestGrad.addColorStop(0, '#331e11');
            nestGrad.addColorStop(0.7, '#1f130b');
            nestGrad.addColorStop(1, 'rgba(15,23,42,0)');
            ctx.fillStyle = nestGrad;
            ctx.beginPath();
            ctx.ellipse(0, 0, 45, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#4a2c18';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.ellipse(0, 2, 40, 10, 0.1, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = '#6e3f20';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(-4, -1, 35, 8, -0.1, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        }

        drawStage1Egg(ctx, sx, sy, p) {
            ctx.save();
            const pulse = 1 + Math.sin(this.time * 6) * 0.03;
            ctx.translate(115 + sx, 155 + sy);
            ctx.scale(pulse, pulse);

            // Egg Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.ellipse(0, 20, 22, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            // Outer Aura Glow
            const auraGlow = ctx.createRadialGradient(0, -10, 5, 0, -10, 35);
            auraGlow.addColorStop(0, 'rgba(254, 240, 138, 0.8)');
            auraGlow.addColorStop(0.5, `rgba(245, 158, 11, ${0.4 + p * 1.5})`);
            auraGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
            ctx.fillStyle = auraGlow;
            ctx.beginPath();
            ctx.arc(0, -10, 35, 0, Math.PI * 2);
            ctx.fill();

            // 3D Egg Body
            const eggGrad = ctx.createRadialGradient(-6, -20, 2, 0, -10, 24);
            eggGrad.addColorStop(0, '#fffbeb');
            eggGrad.addColorStop(0.3, '#fde047');
            eggGrad.addColorStop(0.75, '#d97706');
            eggGrad.addColorStop(1, '#78350f');

            ctx.fillStyle = eggGrad;
            ctx.beginPath();
            ctx.ellipse(0, -10, 19, 25, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#b45309';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Speckle Spots
            ctx.fillStyle = '#b45309';
            ctx.globalAlpha = 0.5;
            [[-6, -18, 3], [8, -8, 2.5], [-5, -2, 2], [6, -22, 2]].forEach(([cx, cy, r]) => {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1.0;

            // Glowing Cracks
            if (p > 0.08) {
                const crackAlpha = Math.min(1, (p - 0.08) * 6);
                ctx.strokeStyle = `rgba(255, 255, 255, ${crackAlpha})`;
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 10;
                ctx.lineWidth = 2.0;

                ctx.beginPath();
                ctx.moveTo(-4, -20);
                ctx.lineTo(0, -12);
                ctx.lineTo(-6, -4);
                ctx.lineTo(2, 4);
                ctx.stroke();

                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }

        drawStage2Hatchling(ctx, sx, sy, p) {
            ctx.save();
            ctx.translate(115 + sx, 150 + sy);

            ctx.fillStyle = '#d97706';
            ctx.beginPath();
            ctx.arc(-18, 18, 6, 0, Math.PI * 2);
            ctx.fill();

            const breathe = Math.sin(this.time * 4) * 2;
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.shadowColor = '#34d399';
            ctx.shadowBlur = 12;

            ctx.beginPath();
            ctx.moveTo(0, 20);
            ctx.bezierCurveTo(-15 + breathe, 5, 15 - breathe, -15, 2, -35 + breathe * 0.5);
            ctx.stroke();

            ctx.strokeStyle = '#6ee7b7';
            ctx.lineWidth = 4;
            ctx.stroke();

            const headX = 2;
            const headY = -35 + breathe * 0.5;

            ctx.fillStyle = '#059669';
            ctx.beginPath();
            ctx.arc(headX, headY, 8, 0, Math.PI * 2);
            ctx.fill();

            const dx = this.mouse.x - (115 + headX);
            const dy = this.mouse.y - (150 + headY);
            const eyeAngle = Math.atan2(dy, dx);
            const eyeOffsetX = Math.cos(eyeAngle) * 2.5;
            const eyeOffsetY = Math.sin(eyeAngle) * 2.5;

            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(headX - 3 + eyeOffsetX * 0.5, headY - 2 + eyeOffsetY * 0.5, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(headX - 3 + eyeOffsetX * 0.5, headY - 2 + eyeOffsetY * 0.5, 1.0, 0, Math.PI * 2);
            ctx.fill();

            if (Math.sin(this.time * 8) > 0.4) {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(headX, headY - 8);
                ctx.lineTo(headX, headY - 16);
                ctx.lineTo(headX - 3, headY - 20);
                ctx.moveTo(headX, headY - 16);
                ctx.lineTo(headX + 3, headY - 20);
                ctx.stroke();
            }

            ctx.restore();
        }

        drawStage3Juvenile(ctx, sx, sy, p) {
            ctx.save();
            ctx.translate(115 + sx, 115 + sy);

            const rockGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 28);
            rockGrad.addColorStop(0, '#38bdf8');
            rockGrad.addColorStop(0.6, '#0369a1');
            rockGrad.addColorStop(1, '#0f172a');
            ctx.fillStyle = rockGrad;
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(0, 10, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            const slither = Math.sin(this.time * 3.5);
            const pts = [
                { x: -55, y: 55 },
                { x: -30 + slither * 4, y: 35 },
                { x: -10, y: 15 },
                { x: 25 - slither * 4, y: 10 },
                { x: 35, y: -20 },
                { x: 10 + slither * 3, y: -45 },
                { x: -15, y: -50 }
            ];

            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 15;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 10;

            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.stroke();

            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 8;
            ctx.stroke();

            ctx.strokeStyle = '#6ee7b7';
            ctx.lineWidth = 3;
            ctx.setLineDash([4, 6]);
            ctx.stroke();
            ctx.setLineDash([]);

            const head = pts[pts.length - 1];
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
            ctx.fill();

            const dx = this.mouse.x - (115 + head.x);
            const dy = this.mouse.y - (115 + head.y);
            const angle = Math.atan2(dy, dx);
            const ex = Math.cos(angle) * 3;
            const ey = Math.sin(angle) * 3;

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(head.x - 3 + ex, head.y - 2 + ey, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(head.x - 3 + ex, head.y - 2 + ey, 1.2, 0, Math.PI * 2);
            ctx.fill();

            if (Math.sin(this.time * 7) > 0.3) {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(head.x - 9, head.y);
                ctx.lineTo(head.x - 17, head.y);
                ctx.lineTo(head.x - 21, head.y - 3);
                ctx.moveTo(head.x - 17, head.y);
                ctx.lineTo(head.x - 21, head.y + 3);
                ctx.stroke();
            }

            ctx.restore();
        }

        drawStage4Adult(ctx, sx, sy, p) {
            ctx.save();
            ctx.translate(115 + sx, 115 + sy);

            ctx.save();
            ctx.rotate(this.time * 0.4);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([10, 8]);
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.ellipse(0, 0, 72, 64, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.rotate(-this.time * 0.3);
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.ellipse(0, 0, 64, 56, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            const breathe = Math.sin(this.time * 2.5) * 2;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 20;

            const outerGrad = ctx.createLinearGradient(-60, -60, 60, 60);
            outerGrad.addColorStop(0, '#fbbf24');
            outerGrad.addColorStop(0.5, '#10b981');
            outerGrad.addColorStop(1, '#047857');

            ctx.strokeStyle = outerGrad;
            ctx.lineWidth = 20 + breathe * 0.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            ctx.arc(-22, 0, 36, 0.5, Math.PI * 2.2);
            ctx.arc(22, 0, 36, Math.PI * 0.8, Math.PI * 2.8);
            ctx.stroke();

            ctx.strokeStyle = '#a7f3d0';
            ctx.lineWidth = 6;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.save();
            ctx.translate(32 + breathe * 0.5, -28 + breathe * 0.5);
            ctx.rotate(-0.4);

            ctx.fillStyle = '#059669';
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(16, 0);
            ctx.lineTo(0, 10);
            ctx.lineTo(-8, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            const dx = this.mouse.x - (115 + 32);
            const dy = this.mouse.y - (115 - 28);
            const angle = Math.atan2(dy, dx);
            const ex = Math.cos(angle) * 1.5;
            const ey = Math.sin(angle) * 1.5;

            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(4 + ex, -3 + ey, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(4 + ex, -3 + ey, 0.9, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();

            if (Math.sin(this.time * 6) > 0.2) {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(16, 0);
                ctx.lineTo(24, 0);
                ctx.lineTo(28, -4);
                ctx.moveTo(24, 0);
                ctx.lineTo(28, 4);
                ctx.stroke();
            }

            ctx.restore();
            ctx.restore();
        }

        start() {
            const loop = () => {
                this.update();
                this.render();
                this.animFrameId = requestAnimationFrame(loop);
            };
            loop();
        }

        destroy() {
            if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        }
    }
    window.AAAPythonCanvasEngine = AAAPythonCanvasEngine;

    const openRoleDetailPage = (roleKey) => {
        const info = roleHeroDetails[roleKey];
        if (!info) return;

        const selectionView = document.getElementById('roadmap-selection-view');
        const detailPageView = document.getElementById('roadmap-detail-page-view');

        if (selectionView) selectionView.style.display = 'none';
        if (detailPageView) detailPageView.style.display = 'block';

        if (typeof loadRoadmapProgressFromSupabase === 'function') {
            loadRoadmapProgressFromSupabase(roleKey);
        }

        // Update Hero Banner
        const titleEl = document.getElementById('roadmap-hero-title');
        const subtitleEl = document.getElementById('roadmap-hero-subtitle');
        const ratingEl = document.getElementById('roadmap-hero-rating');
        const hoursEl = document.getElementById('roadmap-metric-hours');
        const projectsEl = document.getElementById('roadmap-metric-projects');
        const levelEl = document.getElementById('roadmap-metric-level');
        const svgCodeText = document.getElementById('roadmap-svg-codetext');
        const stop1 = document.getElementById('stop1');
        const stop2 = document.getElementById('stop2');
        const demandEl = document.getElementById('roadmap-demand-text');
        const openingsEl = document.getElementById('roadmap-openings-text');
        const salaryEl = document.getElementById('roadmap-salary-text');

        if (titleEl) titleEl.textContent = info.title;
        if (subtitleEl) subtitleEl.textContent = info.subtitle;
        if (ratingEl) ratingEl.textContent = info.rating;
        if (hoursEl) hoursEl.textContent = info.hours;
        if (projectsEl) projectsEl.textContent = info.projects;
        if (levelEl) levelEl.textContent = info.level;
        if (svgCodeText) svgCodeText.textContent = info.codeText;
        if (stop1) stop1.setAttribute('stop-color', info.accent1);
        if (stop2) stop2.setAttribute('stop-color', info.accent2);
        if (demandEl && info.demandText) demandEl.textContent = info.demandText;
        if (openingsEl && info.openingsText) openingsEl.textContent = info.openingsText;
        if (salaryEl && info.salaryText) salaryEl.textContent = info.salaryText;

        // Reset progress and stats based on completed/in-progress skills
        const updateRoadmapProgressStats = () => {
            const skillPills = document.querySelectorAll('.skill-item-pill');
            const total = skillPills.length || 1;
            let completedCount = 0;
            let inProgressCount = 0;

            skillPills.forEach(pill => {
                const name = pill.getAttribute('data-skill');
                if (name) {
                    const st = getSkillStatus(name);
                    if (st === 'completed') completedCount++;
                    else if (st === 'in_progress') inProgressCount++;
                }
            });

            const pct = Math.round((completedCount / total) * 100);

            const pctEl = document.getElementById('roadmap-page-progress-pct');
            const subEl = document.getElementById('roadmap-progress-subtitle');
            const arcCircle = document.getElementById('progressArcCircle');
            const streakEl = document.getElementById('stat-streak');
            const xpEl = document.getElementById('stat-xp');
            const lessonsEl = document.getElementById('stat-lessons');
            const badgesEl = document.getElementById('stat-badges');

            if (pctEl) pctEl.textContent = `${pct}%`;
            if (subEl) subEl.textContent = `${completedCount} of ${total} Skills Completed`;
            if (arcCircle) {
                const offset = 201 - Math.round(201 * (pct / 100));
                arcCircle.setAttribute('stroke-dashoffset', offset);
            }

            if (streakEl) streakEl.textContent = completedCount > 0 ? '1' : '0';
            if (xpEl) xpEl.textContent = (completedCount * 150 + inProgressCount * 50).toLocaleString();
            if (lessonsEl) lessonsEl.textContent = completedCount;
            if (badgesEl) badgesEl.textContent = Math.floor(completedCount / 2);

            // Update Plant Growth Tree SVG Widget Stage
            const seedGroup = document.getElementById('stage-seed');
            const sproutGroup = document.getElementById('stage-sprout');
            const plantGroup = document.getElementById('stage-plant');
            const treeGroup = document.getElementById('stage-tree');
            const treeTitle = document.getElementById('tree-stage-title');
            const treeDesc = document.getElementById('tree-stage-desc');

            if (seedGroup) seedGroup.style.display = 'none';
            if (sproutGroup) sproutGroup.style.display = 'none';
            if (plantGroup) plantGroup.style.display = 'none';
            if (treeGroup) treeGroup.style.display = 'none';

            if (treeGroup) treeGroup.style.display = 'block';
            if (treeTitle) treeTitle.textContent = 'Career Mastery Tree';
            if (treeDesc) treeDesc.textContent = `${completedCount} completed · ${inProgressCount} in progress`;
        };

        window.updateRoadmapProgressStatsGlobal = updateRoadmapProgressStats;

        // Render Vertical Timeline Tree Structure
        const stagesContainer = document.getElementById('roadmap-page-stages-container');
        if (stagesContainer) {
            stagesContainer.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                    <div>
                        <h3 style="font-family:'Outfit',sans-serif; font-weight:800; font-size:1.35rem; color:var(--text-main); margin:0 0 4px 0;">
                            ${escapeHTML(info.title)} Timeline Tree
                        </h3>
                        <span style="font-size: 0.82rem; color: #94a3b8;">${escapeHTML(info.subtitle)}</span>
                    </div>
                    <span style="font-size: 0.78rem; color: #a855f7; font-weight: 700; background: rgba(168, 85, 247, 0.12); border: 1px solid rgba(168, 85, 247, 0.3); padding: 6px 14px; border-radius: 20px;">
                        Interactive Learning Path
                    </span>
                </div>

                <!-- 2-Column Grid Layout: Left = Timeline Tree; Right = Sticky Tree Growth Card -->
                <div style="display: grid; grid-template-columns: 1fr 300px; gap: 32px; align-items: start;">

                    <!-- Left Column: Timeline Tree -->
                    <div class="roadmap-timeline-tree" style="position: relative; padding-left: 32px; display: flex; flex-direction: column; gap: 36px;">
                        <!-- Dark Base Track Line -->
                        <div style="position: absolute; left: 11px; top: 12px; bottom: 12px; width: 3px; background: rgba(255,255,255,0.08); border-radius: 2px;"></div>

                        <!-- Active Animated Laser Beam Line -->
                        <div id="timeline-laser-spine" class="timeline-laser-progress" style="position: absolute; left: 11px; top: 12px; height: 15%; width: 3px; border-radius: 2px; z-index: 1; transition: height 0.2s ease-out;"></div>

                        ${info.stages.map((stg, i) => `
                            <div class="timeline-tree-node" style="position: relative; display: flex; flex-direction: column; gap: 10px;">
                                <!-- Glowing Circle Bullet Marker on Line -->
                                <div class="timeline-bullet-marker ${i === 0 ? 'active-node' : ''}" style="position: absolute; left: -32px; top: 4px; width: 22px; height: 22px; border-radius: 50%; background: #0f172a; border: 3px solid ${i % 3 === 0 ? '#a855f7' : i % 3 === 1 ? '#3b82f6' : '#10b981'}; box-shadow: 0 0 10px ${i % 3 === 0 ? 'rgba(168,85,247,0.5)' : i % 3 === 1 ? 'rgba(59,130,246,0.5)' : 'rgba(16,185,129,0.5)'}; display: flex; align-items: center; justify-content: center; z-index: 2;">
                                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #ffffff;"></div>
                                </div>

                                <!-- Node Header -->
                                <div>
                                    <h3 style="font-family:'Outfit',sans-serif; font-size: 1.25rem; font-weight: 800; color: #ffffff; margin: 0 0 6px 0;">
                                        ${escapeHTML(stg.title)}
                                    </h3>
                                    ${stg.description ? `<p style="font-size: 0.85rem; color: #94a3b8; margin: 0 0 14px 0; line-height: 1.5;">${escapeHTML(stg.description)}</p>` : ''}
                                </div>

                                <!-- Interactive Pill Widgets Grid (Icons Only - Click to open right-side half page drawer) -->
                                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                                    ${stg.items.map((item, itemIdx) => `
                                        <div class="skill-item-pill" data-skill="${escapeHTML(item)}" title="Click to view About, Resources & Interview Questions">
                                            <div class="skill-pill-icon-box">
                                                ${getSkillIconSvg(item)}
                                            </div>
                                            <span>${escapeHTML(item)}</span>
                                            <div class="skill-status-container" data-skill-status-container="${escapeHTML(item)}">
                                                ${getSkillStatusBadgeHtml(item)}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Right Column: Sticky Growth Card (AAA Canvas 2D Engine for python-dev, Botanical Tree for others) -->
                    ${roleKey === 'python-dev' ? `
                    <div class="botanical-card-aura" style="position: sticky; top: 90px; background: rgba(11, 17, 32, 0.96); backdrop-filter: blur(28px); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 24px; padding: 22px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; transition: all 0.3s ease; box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(245,158,11,0.15); overflow: hidden;">
                        <!-- Card Header Badge -->
                        <div style="display: flex; align-items: center; gap: 8px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); padding: 6px 16px; border-radius: 20px; font-size: 0.78rem; font-weight: 800; color: #fbbf24; letter-spacing: 0.03em;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                            Realistic Python Growth
                        </div>

                        <!-- Interactive HiDPI 60fps AAA Canvas Container -->
                        <div id="python-canvas-wrapper" style="position: relative; width: 230px; height: 230px; border-radius: 20px; overflow: hidden; background: radial-gradient(circle, rgba(30,41,59,0.8) 0%, rgba(11,17,32,0.98) 80%); border: 1px solid rgba(255,255,255,0.08); cursor: crosshair;" title="Hover & Move cursor to interact with environment & Python eyes">
                            <canvas id="python-aaa-canvas" width="230" height="230" style="display: block; width: 100%; height: 100%;"></canvas>
                        </div>

                        <!-- Dynamic Phase Indicator & Typed Description -->
                        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                            <span id="scroll-tree-phase-badge" style="font-size: 0.85rem; font-weight: 800; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.06em; text-shadow: 0 0 10px rgba(245,158,11,0.5);">
                                Phase 1: Ancient Egg
                            </span>
                            <span id="scroll-tree-phase-desc" style="font-size: 0.78rem; color: #94a3b8; line-height: 1.4; min-height: 36px;">
                                Incubating in nest with bio-luminescent particles & pulsing heartbeat
                            </span>
                        </div>

                        <!-- Liquid Motion Progress Bar -->
                        <div style="position: relative; width: 100%; height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 2px;">
                            <div id="scroll-tree-progress-bar" style="height: 100%; width: 5%; background: linear-gradient(90deg, #fbbf24, #10b981, #38bdf8, #a855f7); border-radius: 4px; transition: width 0.15s ease-out; box-shadow: 0 0 14px rgba(245,158,11,0.9);"></div>
                        </div>
                    </div>
                    ` : `
                    <div class="botanical-card-aura" style="position: sticky; top: 90px; background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(24px); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 20px; padding: 22px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; transition: all 0.3s ease;">
                        <!-- Card Header Badge (No Emojis) -->
                        <div style="display: flex; align-items: center; gap: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 6px 16px; border-radius: 20px; font-size: 0.78rem; font-weight: 800; color: #a7f3d0; letter-spacing: 0.03em;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
                            Realistic Botanical Growth
                        </div>

                        <!-- Large Photorealistic Growing SVG Canvas -->
                        <div style="position: relative; width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle, rgba(16,185,129,0.2) 0%, rgba(15,23,42,0) 75%); border-radius: 50%;">
                            <!-- Ambient Floating Fireflies / Spores -->
                            <svg width="220" height="220" style="position: absolute; inset: 0; pointer-events: none;">
                                <circle class="firefly-spore-1" cx="35" cy="145" r="2.5" fill="#a7f3d0" opacity="0.85"/>
                                <circle class="firefly-spore-2" cx="185" cy="115" r="3" fill="#6ee7b7" opacity="0.9"/>
                                <circle class="firefly-spore-3" cx="145" cy="55" r="2.2" fill="#34d399" opacity="0.8"/>
                                <circle class="firefly-spore-1" cx="75" cy="175" r="2" fill="#f59e0b" opacity="0.75"/>
                                <circle class="firefly-spore-2" cx="160" cy="165" r="2.8" fill="#38bdf8" opacity="0.85"/>
                            </svg>

                            <svg id="scroll-tree-growth-svg" width="210" height="210" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <!-- Photorealistic Bark Gradient -->
                                    <linearGradient id="barkGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                                        <stop offset="0%" stop-color="#2d1a0e"/>
                                        <stop offset="35%" stop-color="#4a2c11"/>
                                        <stop offset="70%" stop-color="#7a4a21"/>
                                        <stop offset="100%" stop-color="#3d210b"/>
                                    </linearGradient>

                                    <!-- Sap Energy Inner Glow Gradient -->
                                    <linearGradient id="sapGlowGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                                        <stop offset="0%" stop-color="#059669"/>
                                        <stop offset="50%" stop-color="#10b981"/>
                                        <stop offset="100%" stop-color="#6ee7b7"/>
                                    </linearGradient>

                                    <!-- Leaf Cluster Multi-Shade Gradients -->
                                    <radialGradient id="leafClusterGrad1" cx="40%" cy="30%" r="70%">
                                        <stop offset="0%" stop-color="#a7f3d0"/>
                                        <stop offset="50%" stop-color="#10b981"/>
                                        <stop offset="100%" stop-color="#047857"/>
                                    </radialGradient>

                                    <radialGradient id="leafClusterGrad2" cx="30%" cy="30%" r="70%">
                                        <stop offset="0%" stop-color="#6ee7b7"/>
                                        <stop offset="60%" stop-color="#059669"/>
                                        <stop offset="100%" stop-color="#064e3b"/>
                                    </radialGradient>

                                    <!-- Bioluminescent Soft Glow Filter -->
                                    <filter id="realTreeGlow" x="-30%" y="-30%" width="160%" height="160%">
                                        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#10b981" flood-opacity="0.75"/>
                                    </filter>
                                </defs>

                                <!-- Deep Underground Soil Mound -->
                                <path d="M8 86 Q50 91 92 86 Q50 83 8 86 Z" fill="#1e293b" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
                                <path d="M12 86 Q50 89 88 86" stroke="rgba(16,185,129,0.3)" stroke-width="2" stroke-linecap="round"/>

                                <!-- Subterranean Glowing Roots (Phase 1) -->
                                <g id="scroll-stage-roots" filter="url(#realTreeGlow)">
                                    <path d="M50 86 Q40 92 32 96" stroke="#059669" stroke-width="2" stroke-linecap="round"/>
                                    <path d="M50 86 Q60 92 68 96" stroke="#059669" stroke-width="2" stroke-linecap="round"/>
                                    <path d="M50 86 Q50 94 50 98" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
                                    <!-- Seed Pod -->
                                    <ellipse cx="50" cy="85" rx="7" ry="5" fill="#f59e0b"/>
                                    <ellipse cx="50" cy="85" rx="4" ry="3" fill="#fbbf24"/>
                                </g>

                                <!-- Organic Curving Wood Trunk -->
                                <path id="tree-dynamic-trunk" d="M50 86 C48 68 52 50 50 25" stroke="url(#barkGrad)" stroke-width="7" stroke-linecap="round" stroke-dasharray="85" stroke-dashoffset="85" style="transition: stroke-dashoffset 0.15s ease-out;" />

                                <!-- Inner Sap Energy Glow Path -->
                                <path id="tree-dynamic-sap" d="M50 86 C48 68 52 50 50 25" stroke="url(#sapGlowGrad)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="85" stroke-dashoffset="85" style="transition: stroke-dashoffset 0.15s ease-out;" filter="url(#realTreeGlow)" />

                                <!-- Left Primary Branch & Twig -->
                                <path id="tree-dynamic-branch-left" d="M50 62 C40 54 32 50 22 45" stroke="url(#barkGrad)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="45" stroke-dashoffset="45" style="transition: stroke-dashoffset 0.15s ease-out;" />
                                <path id="tree-dynamic-twig-left" d="M30 52 C26 44 20 40 14 36" stroke="url(#barkGrad)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="30" stroke-dashoffset="30" style="transition: stroke-dashoffset 0.15s ease-out;" />

                                <!-- Right Primary Branch & Twig -->
                                <path id="tree-dynamic-branch-right" d="M50 52 C60 44 68 40 78 35" stroke="url(#barkGrad)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="45" stroke-dashoffset="45" style="transition: stroke-dashoffset 0.15s ease-out;" />
                                <path id="tree-dynamic-twig-right" d="M68 40 C74 32 80 28 86 24" stroke="url(#barkGrad)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="30" stroke-dashoffset="30" style="transition: stroke-dashoffset 0.15s ease-out;" />

                                <!-- Realistic Foliage Canopy (Gently Swaying in Wind) -->
                                <g id="tree-dynamic-foliage" class="realistic-foliage-sway" opacity="0" transform="scale(0.15)" transform-origin="50 30" style="transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);" filter="url(#realTreeGlow)">
                                    <!-- Main Canopy Clusters -->
                                    <circle cx="50" cy="26" r="22" fill="url(#leafClusterGrad1)"/>
                                    <circle cx="30" cy="38" r="17" fill="url(#leafClusterGrad2)"/>
                                    <circle cx="70" cy="38" r="17" fill="url(#leafClusterGrad1)"/>
                                    <circle cx="50" cy="12" r="16" fill="url(#leafClusterGrad2)"/>
                                    <circle cx="16" cy="42" r="11" fill="url(#leafClusterGrad1)"/>
                                    <circle cx="84" cy="32" r="11" fill="url(#leafClusterGrad2)"/>

                                    <!-- Leaf Vein Highlights -->
                                    <path d="M50 16 Q45 26 40 30" stroke="#a7f3d0" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
                                    <path d="M50 16 Q55 26 60 30" stroke="#a7f3d0" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>

                                    <!-- Glowing Bioluminescent Energy Fruits -->
                                    <circle class="fruit-glow-pulse" cx="36" cy="26" r="4.5" fill="#f43f5e"/>
                                    <circle cx="36" cy="26" r="2" fill="#ffe4e6"/>
                                    <circle class="fruit-glow-pulse" cx="64" cy="30" r="4.5" fill="#fbbf24"/>
                                    <circle cx="64" cy="30" r="2" fill="#fef3c7"/>
                                    <circle class="fruit-glow-pulse" cx="50" cy="14" r="5" fill="#a855f7"/>
                                    <circle cx="50" cy="14" r="2.5" fill="#f3e8ff"/>
                                </g>
                            </svg>
                        </div>

                        <!-- Phase Indicator Text (NO EMOJIS) -->
                        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                            <span id="scroll-tree-phase-badge" style="font-size: 0.85rem; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.06em;">
                                Phase 1: Seedling Stage
                            </span>
                            <span id="scroll-tree-phase-desc" style="font-size: 0.78rem; color: #94a3b8; line-height: 1.4;">
                                Subterranean seed forming root system in soil
                            </span>
                        </div>

                        <!-- Growth Fill Progress Bar -->
                        <div style="position: relative; width: 100%; height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 2px;">
                            <div id="scroll-tree-progress-bar" style="height: 100%; width: 5%; background: linear-gradient(to right, #10b981, #3b82f6, #a855f7); border-radius: 4px; transition: width 0.15s ease-out; box-shadow: 0 0 12px rgba(16,185,129,0.9);"></div>
                        </div>
                    </div>
                    `}
                </div>
            `;

            // Destroy previous AAA Python Canvas instance if present
            if (window.activePythonCanvasEngine) {
                window.activePythonCanvasEngine.destroy();
                window.activePythonCanvasEngine = null;
            }

            // Spawn new AAA Canvas Engine for python-dev
            if (roleKey === 'python-dev') {
                setTimeout(() => {
                    if (document.getElementById('python-aaa-canvas')) {
                        window.activePythonCanvasEngine = new AAAPythonCanvasEngine('python-aaa-canvas');
                    }
                }, 50);
            }

            // Attach skill pill click handlers to open right-side half-page drawer
            stagesContainer.querySelectorAll('.skill-item-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const skillName = pill.getAttribute('data-skill');
                    if (skillName) {
                        openSkillDetailDrawer(skillName);
                    }
                });
            });

            // Scroll observer to illuminate timeline line & grow visualizer continuously as you scroll down
            const handleTimelineScroll = () => {
                const treeEl = stagesContainer.querySelector('.roadmap-timeline-tree');
                const laserLine = document.getElementById('timeline-laser-spine');
                if (!treeEl) return;

                const rect = treeEl.getBoundingClientRect();
                const windowHeight = window.innerHeight;

                const startPos = windowHeight * 0.75;
                const totalDist = rect.height || 1;
                const currentDist = startPos - rect.top;
                let progress = Math.max(0.05, Math.min(1, currentDist / totalDist));

                if (laserLine) laserLine.style.height = `${progress * 100}%`;

                // Update Sticky Right Side Visualizer
                const trunk = document.getElementById('tree-dynamic-trunk');
                const sap = document.getElementById('tree-dynamic-sap');
                const branchL = document.getElementById('tree-dynamic-branch-left');
                const twigL = document.getElementById('tree-dynamic-twig-left');
                const branchR = document.getElementById('tree-dynamic-branch-right');
                const twigR = document.getElementById('tree-dynamic-twig-right');
                const foliage = document.getElementById('tree-dynamic-foliage');
                const roots = document.getElementById('scroll-stage-roots');
                const phaseBadge = document.getElementById('scroll-tree-phase-badge');
                const phaseDesc = document.getElementById('scroll-tree-phase-desc');
                const progressBar = document.getElementById('scroll-tree-progress-bar');

                if (progressBar) progressBar.style.width = `${Math.round(progress * 100)}%`;

                if (roleKey === 'python-dev') {
                    if (window.activePythonCanvasEngine) {
                        window.activePythonCanvasEngine.setTargetProgress(progress);
                    }

                    if (phaseBadge && phaseDesc) {
                        if (progress < 0.25) {
                            phaseBadge.textContent = 'Phase 1: Ancient Egg';
                            phaseBadge.style.color = '#fbbf24';
                            phaseDesc.textContent = 'Incubating in nest with bio-luminescent particles & pulsing heartbeat';
                        } else if (progress < 0.50) {
                            phaseBadge.textContent = 'Phase 2: Hatchling Serpent';
                            phaseBadge.style.color = '#34d399';
                            phaseDesc.textContent = 'Baby Python hatching & emerging with slithering motion & eye tracking';
                        } else if (progress < 0.75) {
                            phaseBadge.textContent = 'Phase 3: Juvenile Mastery';
                            phaseBadge.style.color = '#38bdf8';
                            phaseDesc.textContent = 'Winding juvenile Python with 3D overlapping emerald scales';
                        } else {
                            phaseBadge.textContent = 'Phase 4: Legendary Adult Python';
                            phaseBadge.style.color = '#a855f7';
                            phaseDesc.textContent = 'Majestic full-grown Python with 3D rotating gold aura & orbital motes';
                        }
                    }
                } else {
                    // Trunk & Inner Sap Core growth (offset 85 down to 0)
                    if (trunk) {
                        const trunkOffset = Math.max(0, 85 - (progress * 85));
                        trunk.style.strokeDashoffset = trunkOffset;
                    }
                    if (sap) {
                        const sapOffset = Math.max(0, 85 - (progress * 85));
                        sap.style.strokeDashoffset = sapOffset;
                    }

                    // Primary Branches growth
                    if (branchL) {
                        const lOffset = progress >= 0.2 ? Math.max(0, 45 - ((progress - 0.2) * 90)) : 45;
                        branchL.style.strokeDashoffset = lOffset;
                    }
                    if (twigL) {
                        const twLOffset = progress >= 0.35 ? Math.max(0, 30 - ((progress - 0.35) * 80)) : 30;
                        twigL.style.strokeDashoffset = twLOffset;
                    }
                    if (branchR) {
                        const rOffset = progress >= 0.3 ? Math.max(0, 45 - ((progress - 0.3) * 90)) : 45;
                        branchR.style.strokeDashoffset = rOffset;
                    }
                    if (twigR) {
                        const twROffset = progress >= 0.45 ? Math.max(0, 30 - ((progress - 0.45) * 80)) : 30;
                        twigR.style.strokeDashoffset = twROffset;
                    }

                    // Foliage Canopy Bloom & Sway (scale & fade in at progress >= 0.5)
                    if (foliage) {
                        if (progress >= 0.5) {
                            const folScale = 0.2 + ((progress - 0.5) * 1.6); // 0.2 -> 1.0
                            const folOpacity = Math.min(1, (progress - 0.5) * 2.2);
                            foliage.style.opacity = folOpacity;
                            foliage.style.transform = `scale(${folScale})`;
                        } else {
                            foliage.style.opacity = 0;
                            foliage.style.transform = 'scale(0.15)';
                        }
                    }

                    // Underground Seed Roots glow intensity
                    if (roots) {
                        roots.style.opacity = progress > 0.4 ? Math.max(0.4, 1 - (progress - 0.4) * 1.2) : 1;
                    }

                    // Update Phase Text (No emojis)
                    if (phaseBadge && phaseDesc) {
                        if (progress < 0.25) {
                            phaseBadge.textContent = 'Phase 1: Seedling Stage';
                            phaseBadge.style.color = '#f59e0b';
                            phaseDesc.textContent = 'Subterranean seed forming root system in soil';
                        } else if (progress < 0.50) {
                            phaseBadge.textContent = 'Phase 2: Sprouting Stage';
                            phaseBadge.style.color = '#34d399';
                            phaseDesc.textContent = 'Stem breaking through soil with fresh green shoots';
                        } else if (progress < 0.75) {
                            phaseBadge.textContent = 'Phase 3: Branching Stage';
                            phaseBadge.style.color = '#38bdf8';
                            phaseDesc.textContent = 'Expanding sturdy wood branches & leaf canopy';
                        } else {
                            phaseBadge.textContent = 'Phase 4: Full Bloom Tree';
                            phaseBadge.style.color = '#a7f3d0';
                            phaseDesc.textContent = 'Majestic career tree fully bloomed with glowing fruits';
                        }
                    }
                }

                // Activate bullet markers on scroll
                const nodes = treeEl.querySelectorAll('.timeline-tree-node');
                nodes.forEach(node => {
                    const nodeRect = node.getBoundingClientRect();
                    const bullet = node.querySelector('.timeline-bullet-marker');
                    if (bullet) {
                        if (nodeRect.top <= windowHeight * 0.75) {
                            bullet.classList.add('active-node');
                        } else {
                            bullet.classList.remove('active-node');
                        }
                    }
                });
            };

            window.addEventListener('scroll', handleTimelineScroll);
            setTimeout(handleTimelineScroll, 100);
        }

        // Initialize progress and stats to 0
        updateRoadmapProgressStats();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Attach click listeners to role buttons
    document.querySelectorAll('.roadmap-role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const roleKey = btn.getAttribute('data-role');
            openRoleDetailPage(roleKey);
        });
    });

    // Back to Roadmaps Button listener
    const btnRoadmapBack = document.getElementById('btn-roadmap-back');
    if (btnRoadmapBack) {
        btnRoadmapBack.addEventListener('click', () => {
            const selectionView = document.getElementById('roadmap-selection-view');
            const detailPageView = document.getElementById('roadmap-detail-page-view');
            if (detailPageView) detailPageView.style.display = 'none';
            if (selectionView) selectionView.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Start Learning Button listener
    const btnRoadmapContinue = document.getElementById('btn-roadmap-continue');
    if (btnRoadmapContinue) {
        btnRoadmapContinue.addEventListener('click', () => {
            const stagesContainer = document.getElementById('roadmap-page-stages-container');
            if (stagesContainer) {
                stagesContainer.scrollIntoView({ behavior: 'smooth' });
            } else {
                const learningTabBtn = document.getElementById('btn-sidebar-learning');
                if (learningTabBtn) learningTabBtn.click();
            }
        });
    }

    // AI Recommendations Auto Search click triggers
    const triggerRecommendationSearch = (skillName) => {
        const learningTabBtn = document.getElementById('btn-sidebar-learning');
        if (learningTabBtn) {
            learningTabBtn.click();
            if (skillInput) skillInput.value = skillName;
            handleSearch();
        }
    };

    // Wire up AI Recommendations click listeners on Dashboard
    const recGraphs = document.getElementById('rec-item-graphs');
    if (recGraphs) {
        recGraphs.style.cursor = 'pointer';
        recGraphs.addEventListener('click', () => triggerRecommendationSearch('Graph Algorithms'));
    }
    const recSysdesign = document.getElementById('rec-item-sysdesign');
    if (recSysdesign) {
        recSysdesign.style.cursor = 'pointer';
        recSysdesign.addEventListener('click', () => triggerRecommendationSearch('System Design'));
    }

    // Top Bar Actions
    const globalSearchTrigger = document.getElementById('global-search-trigger');
    if (globalSearchTrigger) {
        globalSearchTrigger.addEventListener('click', () => {
            const learningTabBtn = document.getElementById('btn-sidebar-learning');
            if (learningTabBtn) learningTabBtn.click();
            if (skillInput) skillInput.focus();
        });
    }

    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', () => {
            showToast('You have no unread notifications.');
        });
    }

    // ── Dedicated AI Mentor page consultation ────────────────────
    const mentorSubmitPage = document.getElementById('mentor-submit-btn-page');
    const mentorResultPage = document.getElementById('mentor-result-page');

    if (mentorSubmitPage) {
        mentorSubmitPage.addEventListener('click', async () => {
            const goal = document.getElementById('mentor-goal-page').value.trim();
            const skills = document.getElementById('mentor-skills-page').value.trim();
            
            // Automatically fetch coding profiles from Settings inputs or LocalStorage
            const leetcode = document.getElementById('settings-leetcode')?.value.trim() || localStorage.getItem('profile_leetcode') || "";
            const github = document.getElementById('settings-github')?.value.trim() || localStorage.getItem('profile_github') || "";
            const codeforces = document.getElementById('settings-codeforces')?.value.trim() || localStorage.getItem('profile_codeforces') || "";
            const codementor = document.getElementById('settings-codementor')?.value.trim() || localStorage.getItem('profile_codementor') || "";

            if (!goal) { mentorResultPage.innerHTML = '<p style="color:#f97316">Please enter your career goal.</p>'; return; }

            mentorSubmitPage.textContent = 'Consulting your mentor...';
            mentorSubmitPage.disabled = true;
            mentorResultPage.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="color:var(--text-sub);">Analyzing your path...</p></div>';

            try {
                const res = await fetch('/mentor-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        goal, 
                        current_skills: skills,
                        leetcode_profile: leetcode,
                        github_profile: github,
                        codeforces_profile: codeforces,
                        codementor_profile: codementor
                    })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                mentorResultPage.innerHTML = `
                    <div style="border-top:1px solid var(--border); padding-top:16px; margin-top:20px;">
                        <p style="color:#f97316; font-weight:700; font-size:1.05rem; margin-bottom:12px;">
                            "${escapeHTML(data.verdict)}"
                        </p>
                        ${ data.lagging_areas && data.lagging_areas.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">Where you are lagging behind:</p>
                        <ul style="padding-left:16px; color:var(--danger); font-size:0.85rem; margin-bottom:12px;">
                            ${data.lagging_areas.map(area => `<li>${escapeHTML(area)}</li>`).join('')}
                        </ul>` : ''}
                        ${ data.wasted_time && data.wasted_time.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:4px; font-weight:600;">Stop wasting time on:</p>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
                            ${data.wasted_time.map(s => `<span class="pill-badge" style="background:#fee2e2;color:#ef4444;border-color:transparent;">${escapeHTML(s)}</span>`).join('')}
                        </div>` : ''}
                        ${ data.must_learn_now && data.must_learn_now.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">Learn these NOW:</p>
                        <ul style="padding-left:16px; color:var(--text-main); font-size:0.85rem; margin-bottom:12px;">
                            ${data.must_learn_now.map(i => `<li><strong>${escapeHTML(i.skill)}</strong> — ${escapeHTML(i.reason)}</li>`).join('')}
                        </ul>` : ''}
                        ${ data.improvement_suggestions && data.improvement_suggestions.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">How to do it better:</p>
                        <ul style="padding-left:16px; color:var(--text-main); font-size:0.85rem; margin-bottom:12px; line-height:1.5;">
                            ${data.improvement_suggestions.map(s => `<li><strong>${escapeHTML(s.action)}</strong> — ${escapeHTML(s.how_to_do_better)}</li>`).join('')}
                        </ul>` : ''}
                        <p style="color:var(--text-sub); font-size:0.85rem; line-height:1.6; margin-bottom:12px;">
                            ${escapeHTML(data.brutal_truth)}
                        </p>
                        <div style="background:var(--primary-light); border-left:3px solid var(--primary); padding:12px 16px; border-radius:8px;">
                            <p style="color:var(--primary); font-size:0.85rem; margin:0; font-weight:600;">This week: ${escapeHTML(data.action_this_week)}</p>
                        </div>
                    </div>
                `;
            } catch(e) {
                mentorResultPage.innerHTML = `<p style="color:var(--danger);">Failed: ${escapeHTML(e.message)}</p>`;
            } finally {
                mentorSubmitPage.textContent = 'Get Brutal Advice';
                mentorSubmitPage.disabled = false;
            }
        });
    }

    // ── MOCK INTERVIEW SIMULATOR LOGIC ──────────────────────────────
    let interviewChatHistory = [];
    let currentInterviewMeta = {};
    let isWaitingForAI = false;

    const interviewStageSetup = document.getElementById('interview-stage-setup');
    const interviewStageChat = document.getElementById('interview-stage-chat');
    const interviewStageLoading = document.getElementById('interview-stage-loading');
    const interviewStageResult = document.getElementById('interview-stage-result');

    const interviewRoleInput = document.getElementById('interview-role-input');
    const interviewTypeSelect = document.getElementById('interview-type-select');
    const interviewBenchmarkSelect = document.getElementById('interview-benchmark-select');
    const btnStartInterview = document.getElementById('btn-start-interview');

    const interviewerNameLabel = document.getElementById('interviewer-name-label');
    const interviewMetaLabel = document.getElementById('interview-meta-label');
    const interviewProgressPill = document.getElementById('interview-progress-pill');
    const btnQuitInterview = document.getElementById('btn-quit-interview');
    const chatStream = document.getElementById('interview-chat-stream');
    const responseInput = document.getElementById('interview-response-input');
    const btnSubmitAnswer = document.getElementById('btn-submit-answer');
    const charCounter = document.getElementById('char-counter');
    const loadingStepText = document.getElementById('interview-loading-step');
    const loadingProgressBar = document.getElementById('interview-loading-bar');

    const resultRing = document.getElementById('interview-result-ring');
    const resultScoreLabel = document.getElementById('interview-result-score-label');
    const resultVerdict = document.getElementById('interview-result-verdict');
    const resultCategoriesList = document.getElementById('interview-result-categories-list');
    const resultJudgment = document.getElementById('interview-result-judgment');
    const resultStrengths = document.getElementById('interview-result-strengths');
    const resultWeaknesses = document.getElementById('interview-result-weaknesses');
    const resultActionPlan = document.getElementById('interview-result-action-plan');
    const resultIdeal = document.getElementById('interview-result-ideal');
    const btnBackToHub = document.getElementById('btn-back-to-hub');
    const historyList = document.getElementById('interview-history-list');

    const initInterviewInputs = async () => {
        try {
            const res = await fetch('/get-user-session');
            if (res.ok) {
                const data = await res.json();
                if (data.logged_in) {
                    const role = data.target_role || '';
                    if (role && interviewRoleInput) {
                        interviewRoleInput.value = role;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load interview user session info:", e);
        }
    };

    const loadInterviewHistory = async () => {
        if (!historyList) return;
        try {
            const res = await fetch('/get-interview-history');
            if (!res.ok) throw new Error("Failed history fetch");
            const data = await res.json();
            
            if (Array.isArray(data) && data.length > 0) {
                latestInterviewScore = data[0].mock_interview_score;
            } else {
                latestInterviewScore = null;
            }
            
            if (!data || data.length === 0) {
                historyList.innerHTML = `<p class="empty-state" style="margin:0; padding: 20px 0;">No interviews simulated yet. Launch your first round above!</p>`;
                return;
            }
            
            historyList.innerHTML = '';
            data.forEach(item => {
                const dateStr = new Date(item.updated_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                
                const card = document.createElement('div');
                card.className = 'interview-history-item';
                card.innerHTML = `
                    <div class="interview-history-info">
                        <div class="interview-history-title">${escapeHTML(item.interview_round_type)} — ${escapeHTML(item.target_company)} Tier</div>
                        <div class="interview-history-meta">Completed: ${dateStr}</div>
                    </div>
                    <div class="interview-history-actions">
                        <span class="interview-history-score">${item.mock_interview_score}%</span>
                        <button class="btn-outline-primary btn-view-report" style="padding:6px 12px; font-size:0.75rem; border-radius:6px;">View Report</button>
                    </div>
                `;
                
                card.querySelector('.btn-view-report').addEventListener('click', () => {
                    let reportObj = null;
                    try {
                        reportObj = typeof item.preparation_status === 'string' ? JSON.parse(item.preparation_status) : item.preparation_status;
                    } catch(e) {
                        console.error("Parse report JSON failed:", e);
                    }
                    if (reportObj) {
                        renderScorecard(reportObj);
                    } else {
                        showToast("Failed to load audit details.");
                    }
                });
                
                historyList.appendChild(card);
            });
            
        } catch (err) {
            console.error("Failed to load history list:", err);
            historyList.innerHTML = `<p class="empty-state" style="margin:0; padding: 20px 0; color:var(--danger);">Failed to load prep logs.</p>`;
        }
    };

    const showStage = (stageId) => {
        [interviewStageSetup, interviewStageChat, interviewStageLoading, interviewStageResult].forEach(el => {
            if (el) el.style.display = 'none';
        });
        if (stageId === 'setup' && interviewStageSetup) interviewStageSetup.style.display = 'block';
        if (stageId === 'chat' && interviewStageChat) interviewStageChat.style.display = 'block';
        if (stageId === 'loading' && interviewStageLoading) interviewStageLoading.style.display = 'block';
        if (stageId === 'result' && interviewStageResult) interviewStageResult.style.display = 'block';
    };

    if (btnStartInterview) {
        btnStartInterview.addEventListener('click', async () => {
            const role = interviewRoleInput.value.trim();
            const type = interviewTypeSelect.value;
            const benchmark = interviewBenchmarkSelect.value;

            if (!role) {
                showToast("Please enter your target role.");
                return;
            }

            showStage('loading');
            if (loadingStepText) loadingStepText.textContent = "Initializing simulation environment...";
            if (loadingProgressBar) loadingProgressBar.style.width = "15%";

            try {
                const res = await fetch('/generate-mock-interview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role, interview_type: type, benchmark })
                });

                if (!res.ok) throw new Error("Failed generation request");
                const data = await res.json();

                if (data.error) throw new Error(data.error);

                interviewChatHistory = [
                    { sender: 'interviewer', text: data.question }
                ];
                currentInterviewMeta = {
                    role,
                    type,
                    benchmark,
                    interviewerName: data.interviewer_name || "Interviewer"
                };

                if (interviewerNameLabel) interviewerNameLabel.textContent = currentInterviewMeta.interviewerName;
                if (interviewMetaLabel) interviewMetaLabel.textContent = `${type} | ${benchmark} Benchmark`;
                if (interviewProgressPill) interviewProgressPill.textContent = "Turn 1 of 3";
                
                if (responseInput) {
                    responseInput.value = '';
                    if (type === 'Coding & DSA') {
                        responseInput.placeholder = "Write your solution approach, time/space complexity, and code here...";
                    } else if (type === 'System Design') {
                        responseInput.placeholder = "Design outline: 1. Core Requirements, 2. API Schema, 3. High Level Architecture, 4. Data Flow/Scaling...";
                    } else {
                        responseInput.placeholder = "STAR format: Situation, Task, Action, Result...";
                    }
                }
                
                if (charCounter) charCounter.textContent = "0 characters";
                if (btnSubmitAnswer) {
                    btnSubmitAnswer.textContent = "Submit Answer";
                    btnSubmitAnswer.disabled = false;
                }

                renderChatStream();
                showStage('chat');

            } catch (err) {
                console.error("Start interview failed:", err);
                showToast(err.message || "Failed to initialize interview simulator.");
                showStage('setup');
            }
        });
    }

    if (responseInput) {
        responseInput.addEventListener('input', () => {
            const count = responseInput.value.length;
            if (charCounter) charCounter.textContent = `${count} characters`;
        });
    }

    const renderChatStream = () => {
        if (!chatStream) return;
        chatStream.innerHTML = '';
        interviewChatHistory.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = `chat-msg ${msg.sender}`;
            
            let htmlContent = escapeHTML(msg.text).replace(/\n/g, '<br>');
            if (msg.text.includes('```')) {
                htmlContent = escapeHTML(msg.text).replace(/```([\s\S]+?)```/g, (_, code) => {
                    return `<pre style="background:var(--bg-card); border:1px solid var(--border); padding:10px; border-radius:6px; font-family:monospace; margin:8px 0; overflow-x:auto;">${code}</pre>`;
                }).replace(/\n/g, '<br>');
            }
            
            bubble.innerHTML = `
                <div>${htmlContent}</div>
                <div class="chat-msg-time">${new Date().toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})}</div>
            `;
            chatStream.appendChild(bubble);
        });
        chatStream.scrollTop = chatStream.scrollHeight;
    };

    if (btnSubmitAnswer) {
        btnSubmitAnswer.addEventListener('click', async () => {
            const responseText = responseInput.value.trim();
            if (!responseText) {
                showToast("Please provide your answer before submitting.");
                return;
            }

            if (isWaitingForAI) return;

            interviewChatHistory.push({ sender: 'candidate', text: responseText });
            renderChatStream();

            responseInput.value = '';
            if (charCounter) charCounter.textContent = "0 characters";

            const turns = interviewChatHistory.filter(m => m.sender === 'candidate').length;
            
            if (btnSubmitAnswer.textContent === "Submit for Evaluation") {
                evaluateInterviewFlow();
                return;
            }

            isWaitingForAI = true;
            btnSubmitAnswer.disabled = true;
            btnSubmitAnswer.textContent = "Processing...";
            
            try {
                const res = await fetch('/respond-mock-interview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role: currentInterviewMeta.role,
                        interview_type: currentInterviewMeta.type,
                        benchmark: currentInterviewMeta.benchmark,
                        chat_history: interviewChatHistory,
                        user_response: responseText
                    })
                });

                if (!res.ok) throw new Error("Failed response submission");
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                if (data.is_completed) {
                    interviewChatHistory.push({ sender: 'interviewer', text: data.question });
                    renderChatStream();
                    
                    btnSubmitAnswer.textContent = "Submit for Evaluation";
                    btnSubmitAnswer.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
                    btnSubmitAnswer.disabled = false;
                    
                    if (interviewProgressPill) interviewProgressPill.textContent = "Review Stage";
                } else {
                    interviewChatHistory.push({ sender: 'interviewer', text: data.question });
                    renderChatStream();
                    
                    btnSubmitAnswer.textContent = "Submit Answer";
                    btnSubmitAnswer.disabled = false;
                    
                    if (interviewProgressPill) {
                        interviewProgressPill.textContent = `Turn ${turns + 1} of 3`;
                    }
                }

            } catch (err) {
                console.error("Submit response failed:", err);
                showToast(err.message || "Failed to contact interviewer.");
                btnSubmitAnswer.textContent = "Submit Answer";
                btnSubmitAnswer.disabled = false;
            } finally {
                isWaitingForAI = false;
            }
        });
    }

    const evaluateInterviewFlow = async () => {
        showStage('loading');
        
        let step = 0;
        const steps = [
            { text: "Extracting dialog transcript...", pct: "30%" },
            { text: "Assessing solution completeness & code quality...", pct: "55%" },
            { text: "Benchmarking metrics against high-growth company bars...", pct: "75%" },
            { text: "Compiling detailed grade scorecard report...", pct: "90%" }
        ];

        const loadingInterval = setInterval(() => {
            if (step < steps.length) {
                if (loadingStepText) loadingStepText.textContent = steps[step].text;
                if (loadingProgressBar) loadingProgressBar.style.width = steps[step].pct;
                step++;
            }
        }, 2200);

        try {
            const res = await fetch('/evaluate-mock-interview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: currentInterviewMeta.role,
                    interview_type: currentInterviewMeta.type,
                    benchmark: currentInterviewMeta.benchmark,
                    chat_history: interviewChatHistory
                })
            });

            clearInterval(loadingInterval);
            if (!res.ok) throw new Error("Evaluation request failed");
            const report = await res.json();
            if (report.error) throw new Error(report.error);

            renderScorecard(report);

        } catch (err) {
            clearInterval(loadingInterval);
            console.error("Evaluation failed:", err);
            showToast("Failed to compile evaluation report. Returning to hub.");
            showStage('setup');
            loadInterviewHistory();
        }
    };

    const renderScorecard = (report) => {
        showStage('result');

        const score = report.score || 0;
        if (resultScoreLabel) resultScoreLabel.textContent = `${score}%`;
        
        if (resultRing) {
            const offset = 389.56 - (389.56 * score / 100);
            resultRing.style.strokeDashoffset = offset;
        }

        if (resultVerdict) {
            resultVerdict.textContent = report.verdict || "No Verdict";
            resultVerdict.className = 'decision-pill'; 
            const lowerVerdict = (report.verdict || '').toLowerCase();
            if (lowerVerdict.includes('strong hire') || lowerVerdict.includes('hire')) {
                resultVerdict.classList.add('select');
            } else if (lowerVerdict.includes('reject') || lowerVerdict.includes('no hire')) {
                resultVerdict.classList.add('reject');
            } else {
                resultVerdict.classList.add('borderline');
            }
        }

        if (resultJudgment) {
            resultJudgment.textContent = report.recruiter_judgment || '';
        }

        if (resultCategoriesList) {
            resultCategoriesList.innerHTML = '';
            const categories = report.categories || [];
            categories.forEach(cat => {
                const catRow = document.createElement('div');
                catRow.style.display = 'flex';
                catRow.style.flexDirection = 'column';
                catRow.style.gap = '4px';
                
                catRow.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:600;">
                        <span style="color:var(--text-sub);">${escapeHTML(cat.category)}</span>
                        <span style="color:var(--primary); font-family:monospace;">${cat.score}/100</span>
                    </div>
                    <div style="width:100%; height:6px; background:var(--border); border-radius:99px; overflow:hidden;">
                        <div style="width:${cat.score}%; height:100%; background:var(--primary); border-radius:99px;"></div>
                    </div>
                    <span style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">${escapeHTML(cat.feedback)}</span>
                `;
                resultCategoriesList.appendChild(catRow);
            });
        }

        if (resultStrengths) {
            resultStrengths.innerHTML = '';
            (report.strengths || []).forEach(str => {
                const li = document.createElement('li');
                li.textContent = str;
                resultStrengths.appendChild(li);
            });
            if ((report.strengths || []).length === 0) {
                resultStrengths.innerHTML = '<li>None identified.</li>';
            }
        }

        if (resultWeaknesses) {
            resultWeaknesses.innerHTML = '';
            (report.weaknesses || []).forEach(weak => {
                const li = document.createElement('li');
                li.textContent = weak;
                resultWeaknesses.appendChild(li);
            });
            if ((report.weaknesses || []).length === 0) {
                resultWeaknesses.innerHTML = '<li>None identified.</li>';
            }
        }

        if (resultActionPlan) {
            resultActionPlan.innerHTML = '';
            (report.action_plan || []).forEach(action => {
                const li = document.createElement('li');
                li.textContent = action;
                resultActionPlan.appendChild(li);
            });
            if ((report.action_plan || []).length === 0) {
                resultActionPlan.innerHTML = '<li>No actions generated. Good job!</li>';
            }
        }

        if (resultIdeal) {
            resultIdeal.textContent = report.ideal_response || 'No ideal response provided.';
        }
    };

    if (btnQuitInterview) {
        btnQuitInterview.addEventListener('click', () => {
            const ok = confirm("Are you sure you want to quit this mock interview simulation? Your ongoing performance progress will be lost.");
            if (ok) {
                showStage('setup');
                loadInterviewHistory();
            }
        });
    }

    if (btnBackToHub) {
        btnBackToHub.addEventListener('click', () => {
            showStage('setup');
            loadInterviewHistory();
        });
    }



    const saveCodingProfiles = async () => {
        const leetcode = document.getElementById('settings-leetcode')?.value.trim() || "";
        const github = document.getElementById('settings-github')?.value.trim() || "";
        const hackerrank = document.getElementById('settings-hackerrank')?.value.trim() || "";
        const codechef = document.getElementById('settings-codechef')?.value.trim() || "";
        const gfg = document.getElementById('settings-gfg')?.value.trim() || "";
        const codeforces = document.getElementById('settings-codeforces')?.value.trim() || "";

        // Save to local storage for safety/instant feedback
        localStorage.setItem('profile_leetcode', leetcode);
        localStorage.setItem('profile_github', github);
        localStorage.setItem('profile_hackerrank', hackerrank);
        localStorage.setItem('profile_codechef', codechef);
        localStorage.setItem('profile_gfg', gfg);
        localStorage.setItem('profile_codeforces', codeforces);

        // Save to DB via backend endpoint (robust, bypasses client-side RLS issues)
        let dbSaved = false;
        try {
            const res = await fetch('/save-coding-profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leetcode_profile: leetcode,
                    github_profile: github,
                    hackerrank_profile: hackerrank,
                    codechef_profile: codechef,
                    gfg_profile: gfg,
                    codeforces_profile: codeforces
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    dbSaved = true;
                    if (data.extracted_stats) {
                        const s = data.extracted_stats;
                        if (s.leetcode?.summary) setValAndSummary('settings-leetcode', 'summary-leetcode', leetcode, s.leetcode.summary);
                        if (s.github?.summary) setValAndSummary('settings-github', 'summary-github', github, s.github.summary);
                        if (s.hackerrank?.summary) setValAndSummary('settings-hackerrank', 'summary-hackerrank', hackerrank, s.hackerrank.summary);
                        if (s.codechef?.summary) setValAndSummary('settings-codechef', 'summary-codechef', codechef, s.codechef.summary);
                        if (s.gfg?.summary) setValAndSummary('settings-gfg', 'summary-gfg', gfg, s.gfg.summary);
                        if (s.codeforces?.summary) setValAndSummary('settings-codeforces', 'summary-codeforces', codeforces, s.codeforces.summary);
                        localStorage.setItem('user_coding_stats', JSON.stringify(s));
                    }
                }
            }
        } catch (e) {
            console.error("Failed to save coding profiles via backend:", e);
        }

        if (dbSaved) {
            showToast('Profiles & live student stats synced successfully to Database!');
        } else {
            showToast('Coding profiles saved locally (Cloud sync failed or pending schema migration).');
        }

        if (leetcode) {
            try {
                showToast('Fetching live LeetCode stats...');
                const res = await fetch(`/get-leetcode-stats?profile=${encodeURIComponent(leetcode)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status === 'success' && data.stats) {
                        leetcodeStats = data.stats;
                        showToast(`Loaded LeetCode solved count: ${leetcodeStats.All} questions!`);
                    } else {
                        showToast('Could not load LeetCode solved count from profile.');
                    }
                }
            } catch (e) {
                console.error("Failed to fetch LeetCode stats on profile save:", e);
            }
        } else {
            leetcodeStats = null;
        }
        renderDashboardProgress();
    };

    const saveAcademicProfile = async () => {
        const fullname = document.getElementById('settings-fullname')?.value.trim() || "";
        const college = document.getElementById('settings-college')?.value.trim() || "";
        const dept = document.getElementById('settings-dept')?.value.trim() || "";
        const cls = document.getElementById('settings-class')?.value || "";
        const targetRole = document.getElementById('settings-target-role')?.value.trim() || "";

        // Store locally
        localStorage.setItem('profile_fullname', fullname);
        localStorage.setItem('profile_college', college);
        localStorage.setItem('profile_dept', dept);
        localStorage.setItem('profile_class', cls);
        localStorage.setItem('profile_target_role', targetRole);

        // Save to DB via backend
        let dbSaved = false;
        try {
            const res = await fetch('/save-profile-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: fullname,
                    college: college,
                    department: dept,
                    academic_class: cls,
                    target_role: targetRole
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') dbSaved = true;
            }
        } catch (e) {
            console.error("Failed to save profile details via backend:", e);
        }

        // Update UI Hero Card & Header
        const chipClass = document.getElementById('chip-class-val');
        const chipCollege = document.getElementById('chip-college-val');
        const chipDept = document.getElementById('chip-dept-val');
        const chipRole = document.getElementById('chip-role-val');
        const profileName = document.getElementById('profile-user-name');

        if (chipClass) chipClass.textContent = cls || "Not Specified";
        if (chipCollege) chipCollege.textContent = college || "Not Specified";
        if (chipDept) chipDept.textContent = dept || "Not Specified";
        if (chipRole) chipRole.textContent = targetRole || "Software Engineer";
        if (profileName && fullname) profileName.textContent = fullname;

        if (fullname) {
            const banner = document.getElementById('welcome-title-banner');
            if (banner) banner.innerHTML = `Welcome back, ${fullname.split(' ')[0]}! <span class="welcome-status-widget"><span class="widget-pulse-glow"></span>Active</span>`;
        }

        if (dbSaved) {
            showToast('Academic profile updated & synced to Cloud successfully!');
        } else {
            showToast('Academic profile updated locally!');
        }
    };

    // Load Coding & Academic Profiles into Settings Cards
    const loadCodingProfiles = async () => {
        let leetcode = localStorage.getItem('profile_leetcode') || '';
        let github = localStorage.getItem('profile_github') || '';
        let hackerrank = localStorage.getItem('profile_hackerrank') || '';
        let codechef = localStorage.getItem('profile_codechef') || '';
        let gfg = localStorage.getItem('profile_gfg') || '';
        let codeforces = localStorage.getItem('profile_codeforces') || '';
        let college = localStorage.getItem('profile_college') || '';
        let dept = localStorage.getItem('profile_dept') || '';
        let cls = localStorage.getItem('profile_class') || '';
        let fullname = localStorage.getItem('profile_fullname') || '';
        let targetRole = localStorage.getItem('profile_target_role') || '';

        // If authenticated user, fetch latest coding & academic profiles from Cloud / DB
        if (window.supabaseClient && currentUserId && currentUserId !== 'anonymous') {
            try {
                const { data } = await window.supabaseClient
                    .from('profiles')
                    .select('full_name, college, department, academic_class, target_role, leetcode_profile, github_profile, hackerrank_profile, codechef_profile, gfg_profile, codeforces_profile')
                    .eq('id', currentUserId)
                    .single();
                    
                if (data) {
                    if (data.full_name) fullname = data.full_name;
                    if (data.college) college = data.college;
                    if (data.department) dept = data.department;
                    if (data.academic_class) cls = data.academic_class;
                    if (data.target_role) targetRole = data.target_role;
                    if (data.leetcode_profile) leetcode = data.leetcode_profile;
                    if (data.github_profile) github = data.github_profile;
                    if (data.hackerrank_profile) hackerrank = data.hackerrank_profile;
                    if (data.codechef_profile) codechef = data.codechef_profile;
                    if (data.gfg_profile) gfg = data.gfg_profile;
                    if (data.codeforces_profile) codeforces = data.codeforces_profile;

                    if (fullname) localStorage.setItem('profile_fullname', fullname);
                    if (college) localStorage.setItem('profile_college', college);
                    if (dept) localStorage.setItem('profile_dept', dept);
                    if (cls) localStorage.setItem('profile_class', cls);
                    if (targetRole) localStorage.setItem('profile_target_role', targetRole);
                    if (leetcode) localStorage.setItem('profile_leetcode', leetcode);
                    if (github) localStorage.setItem('profile_github', github);
                    if (hackerrank) localStorage.setItem('profile_hackerrank', hackerrank);
                    if (codechef) localStorage.setItem('profile_codechef', codechef);
                    if (gfg) localStorage.setItem('profile_gfg', gfg);
                    if (codeforces) localStorage.setItem('profile_codeforces', codeforces);
                }
            } catch (e) {
                console.warn("[PROFILES] Cloud profile fetch deferred:", e);
            }
        }

        // Populate Settings Inputs
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val;
        };
        setVal('settings-fullname', fullname);
        setVal('settings-college', college);
        setVal('settings-dept', dept);
        setVal('settings-class', cls);
        setVal('settings-target-role', targetRole);

        const setValAndSummary = (id, summaryId, val, customSummary) => {
            setVal(id, val);
            const summaryEl = document.getElementById(summaryId);
            if (summaryEl) {
                summaryEl.textContent = customSummary ? customSummary : (val ? val : "Not configured");
                summaryEl.style.color = val ? "var(--text-main)" : "var(--text-muted)";
            }
        };
        
        let cachedStats = {};
        try {
            cachedStats = JSON.parse(localStorage.getItem('user_coding_stats') || '{}');
        } catch (e) {}

        setValAndSummary('settings-leetcode', 'summary-leetcode', leetcode, cachedStats.leetcode?.summary);
        setValAndSummary('settings-github', 'summary-github', github, cachedStats.github?.summary);
        setValAndSummary('settings-hackerrank', 'summary-hackerrank', hackerrank, cachedStats.hackerrank?.summary);
        setValAndSummary('settings-codechef', 'summary-codechef', codechef, cachedStats.codechef?.summary);
        setValAndSummary('settings-gfg', 'summary-gfg', gfg, cachedStats.gfg?.summary);
        setValAndSummary('settings-codeforces', 'summary-codeforces', codeforces, cachedStats.codeforces?.summary);

        // Update Hero Card Chips
        const chipClass = document.getElementById('chip-class-val');
        const chipCollege = document.getElementById('chip-college-val');
        const chipDept = document.getElementById('chip-dept-val');
        const chipRole = document.getElementById('chip-role-val');
        const profileName = document.getElementById('profile-user-name');

        if (chipClass) chipClass.textContent = cls || "Not Specified";
        if (chipCollege) chipCollege.textContent = college || "Not Specified";
        if (chipDept) chipDept.textContent = dept || "Not Specified";
        if (chipRole) chipRole.textContent = targetRole || "Software Engineer";
        if (profileName && fullname) profileName.textContent = fullname;
    };

    // Set Welcome back title initials and text
    const updateWelcomeMessage = async () => {
        let name = 'Candidate';
        let email = 'candidate@example.com';
        
        try {
            const res = await fetch('/get-user-session');
            if (res.ok) {
                const data = await res.json();
                if (data.logged_in) {
                    name = data.name || 'Candidate';
                    email = data.email || 'candidate@example.com';
                    currentUserId = data.id;
                    loadCodingProfiles();
                } else {
                    const storedUser = sessionStorage.getItem('logged_in_user_email');
                    if (storedUser) {
                        name = storedUser.split('@')[0];
                        email = storedUser;
                    } else {
                        name = data.name || 'Candidate';
                        email = data.email || 'candidate@example.com';
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch user session:", e);
            const storedUser = sessionStorage.getItem('logged_in_user_email') || 'Candidate';
            name = storedUser.split('@')[0];
            email = storedUser;
        }

        const savedFullname = localStorage.getItem('profile_fullname');
        if (savedFullname && savedFullname.trim() !== '') {
            name = savedFullname.trim();
        } else {
            name = name.charAt(0).toUpperCase() + name.slice(1);
        }
        
        // Calculate smart initials
        let initials = 'US';
        if (name && name !== 'Candidate') {
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) {
                initials = (parts[0][0] + parts[1][0]).toUpperCase();
            } else if (name.length >= 2) {
                initials = name.substring(0, 2).toUpperCase();
            } else {
                initials = name[0].toUpperCase();
            }
        }

        const banner = document.getElementById('welcome-title-banner');
        if (banner) banner.innerHTML = `Welcome back, ${name.split(' ')[0]}! <span class="welcome-status-widget"><span class="widget-pulse-glow"></span>Active</span>`;
        
        const avatarInitials = document.getElementById('user-avatar-initials');
        if (avatarInitials) avatarInitials.textContent = initials;

        const profileName = document.getElementById('profile-user-name');
        const profileEmail = document.getElementById('profile-user-email');
        const profileAvatar = document.getElementById('profile-avatar');

        if (profileName) profileName.textContent = name;
        if (profileEmail) profileEmail.textContent = email;
        if (profileAvatar) profileAvatar.textContent = initials;

        loadCodingProfiles();
    };

    const initDsaProgress = async () => {
        try {
            const res = await fetch('/get-dsa-progress');
            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list)) {
                    solvedDsaQuestions = list;
                }
            }
        } catch (e) {
            console.error("Failed to fetch DSA progress from DB:", e);
        }

        try {
            const leetcode = localStorage.getItem('profile_leetcode') || "";
            const url = leetcode ? `/get-leetcode-stats?profile=${encodeURIComponent(leetcode)}` : '/get-leetcode-stats';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.status === 'success' && data.stats) {
                    leetcodeStats = data.stats;
                }
            }
        } catch (e) {
            console.warn("Failed to fetch LeetCode stats on startup:", e);
        }

        renderDashboardProgress();
    };

    // Initial render call
    updateWelcomeMessage();
    initDsaProgress();
    initSavedPlaylists();
    initActiveRoadmap();
    initProfileMilestones();

    // Wire up Save Academic & Coding Profiles settings buttons
    const btnSaveAcademicProfile = document.getElementById('btn-save-academic-profile');
    if (btnSaveAcademicProfile) {
        btnSaveAcademicProfile.addEventListener('click', saveAcademicProfile);
    }

    const btnSaveProfiles = document.getElementById('btn-save-profiles');
    if (btnSaveProfiles) {
        btnSaveProfiles.addEventListener('click', saveCodingProfiles);
    }

    // AI Mentor Tab Switcher Logic
    const tabMentorCareer = document.getElementById('tab-mentor-career');
    const tabMentorCoding = document.getElementById('tab-mentor-coding');
    const panelMentorCareer = document.getElementById('panel-mentor-career');
    const panelMentorCoding = document.getElementById('panel-mentor-coding');

    if (tabMentorCareer && tabMentorCoding && panelMentorCareer && panelMentorCoding) {
        tabMentorCareer.addEventListener('click', () => {
            tabMentorCareer.classList.add('active');
            tabMentorCoding.classList.remove('active');
            panelMentorCareer.style.display = 'block';
            panelMentorCoding.style.display = 'none';
        });

        tabMentorCoding.addEventListener('click', () => {
            tabMentorCoding.classList.add('active');
            tabMentorCareer.classList.remove('active');
            panelMentorCoding.style.display = 'block';
            panelMentorCareer.style.display = 'none';
            loadCodingProfiles();
        });
    }

    // Redirect to Settings button
    const btnMentorGoSettings = document.getElementById('btn-mentor-go-settings');
    if (btnMentorGoSettings) {
        btnMentorGoSettings.addEventListener('click', () => {
            const settingsTabBtn = document.getElementById('btn-sidebar-settings');
            if (settingsTabBtn) settingsTabBtn.click();
        });
    }

    // Coding Mentor Submit Logic
    const codingSubmitBtnPage = document.getElementById('coding-submit-btn-page');
    const codingResultPage = document.getElementById('coding-result-page');

    if (codingSubmitBtnPage && codingResultPage) {
        codingSubmitBtnPage.addEventListener('click', async () => {
            const leetcode = document.getElementById('settings-leetcode')?.value.trim() || localStorage.getItem('profile_leetcode') || "";
            const github = document.getElementById('settings-github')?.value.trim() || localStorage.getItem('profile_github') || "";
            const hackerrank = document.getElementById('settings-hackerrank')?.value.trim() || localStorage.getItem('profile_hackerrank') || "";
            const codechef = document.getElementById('settings-codechef')?.value.trim() || localStorage.getItem('profile_codechef') || "";
            const gfg = document.getElementById('settings-gfg')?.value.trim() || localStorage.getItem('profile_gfg') || "";
            const codeforces = document.getElementById('settings-codeforces')?.value.trim() || localStorage.getItem('profile_codeforces') || "";

            if (!leetcode && !github && !hackerrank && !codechef && !gfg && !codeforces) {
                codingResultPage.innerHTML = `
                    <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:12px; color:#ef4444; font-size:0.85rem; font-weight:600; margin-top:16px;">
                        Please configure at least one coding profile in Settings to execute the analysis.
                    </div>
                `;
                return;
            }

            codingSubmitBtnPage.textContent = 'Auditing coding standing...';
            codingSubmitBtnPage.disabled = true;
            codingResultPage.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="color:var(--text-sub);">Analyzing coding standings & DSA progress...</p></div>';

            try {
                const res = await fetch('/mentor-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        mentor_type: "coding",
                        goal: "Full technical analysis and coding standing critique",
                        current_skills: "Software development and problem solving",
                        leetcode_profile: leetcode,
                        github_profile: github,
                        hackerrank_profile: hackerrank,
                        codechef_profile: codechef,
                        gfg_profile: gfg,
                        codeforces_profile: codeforces
                    })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                const snapshot = data.performance_snapshot || {};
                const strengths = data.strengths || [];
                const growthAreas = data.high_impact_growth_areas || {};
                const readiness = data.interview_readiness || {};
                const roadmap = data.roadmap_30_day || {};
                const insights = data.ai_insights || [];
                const motivation = data.motivation || "";
                const dbCards = data.visual_dashboard_cards || {};

                codingResultPage.innerHTML = `
                    <div style="border-top: 1px solid var(--border); padding-top: 24px; margin-top: 24px; display: flex; flex-direction: column; gap: 28px;">
                        
                        <!-- Header Banner -->
                        <div style="background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 16px; padding: 28px; color: white; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 20px rgba(99, 102, 241, 0.15);">
                            <h2 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.8rem; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                                Coding Growth Report
                            </h2>
                            <p style="margin: 0; font-size: 0.95rem; opacity: 0.9; font-weight: 500;">
                                Premium Technical Alignment & Placement Readiness Audit
                            </p>
                        </div>

                        <!-- 1. Performance Snapshot -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                1. Performance Snapshot
                            </h3>
                            <p style="font-size: 0.925rem; line-height: 1.6; color: var(--text-sub); margin: 0; padding: 14px; background: rgba(99, 102, 241, 0.04); border-left: 4px solid #6366f1; border-radius: 0 8px 8px 0; font-style: italic;">
                                "${escapeHTML(snapshot.summary)}"
                            </p>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 8px;">
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Solved</span>
                                    <strong style="font-size: 1.25rem; color: var(--text-main);">${escapeHTML(snapshot.total_solved || '0')} Problems</strong>
                                </div>
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Difficulty Breakdown</span>
                                    <strong style="font-size: 1rem; color: var(--text-main);">${escapeHTML(snapshot.difficulty_distribution || '—')}</strong>
                                </div>
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Strongest Platform</span>
                                    <strong style="font-size: 1.25rem; color: var(--text-main);">${escapeHTML(snapshot.strongest_platform || '—')}</strong>
                                </div>
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Contests & Streak</span>
                                    <strong style="font-size: 0.95rem; color: var(--text-main);">${escapeHTML(snapshot.contest_participation || '—')} (${escapeHTML(snapshot.current_streak || '0')})</strong>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 16px; margin-top: 8px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">Growth Score:</span>
                                    <span style="font-size: 1.4rem; font-weight: 800; color: #6366f1;">${escapeHTML(snapshot.growth_score || '0')}/100</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">Current Tier:</span>
                                    <span class="pill-badge" style="background: var(--primary-light); color: var(--primary); font-weight: 800; font-size: 0.85rem; padding: 6px 12px; border-radius: 6px;">
                                        ${escapeHTML(snapshot.level || 'Beginner Explorer')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- 2. Strength Analysis -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                2. Strength Analysis
                            </h3>
                            <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                                ${strengths.map(s => `
                                    <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <strong style="color: var(--success); font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                                            <span>✓</span> ${escapeHTML(s.title)}
                                        </strong>
                                        <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.5;">${escapeHTML(s.why)}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 3. Skill Gap Analysis -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                3. High-Impact Areas for Growth
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                                <div style="background: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #ef4444; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">Critical</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.critical || []).map(topic => `<span class="pill-badge" style="background:#fef2f2; color:#ef4444; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                                <div style="background: rgba(245, 158, 11, 0.03); border: 1px solid rgba(245, 158, 11, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #f59e0b; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">Important</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.important || []).map(topic => `<span class="pill-badge" style="background:#fffbeb; color:#d97706; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                                <div style="background: rgba(59, 130, 246, 0.03); border: 1px solid rgba(59, 130, 246, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #3b82f6; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">Optional</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.optional || []).map(topic => `<span class="pill-badge" style="background:#eff6ff; color:#2563eb; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. Interview Readiness Assessment -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                4. Interview Readiness Assessment
                            </h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex-wrap: wrap;">
                                <div style="display: flex; flex-direction: column; gap: 14px;">
                                    ${[
                                        { label: "Internship Interviews", val: readiness.internships || 0, color: "#10b981" },
                                        { label: "Service Companies", val: readiness.service_companies || 0, color: "#3b82f6" },
                                        { label: "Product Companies", val: readiness.product_companies || 0, color: "#f59e0b" },
                                        { label: "FAANG-Level Interviews", val: readiness.faang_level || 0, color: "#ef4444" }
                                    ].map(item => `
                                        <div style="display: flex; flex-direction: column; gap: 6px;">
                                            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; color: var(--text-main);">
                                                <span>${escapeHTML(item.label)}</span>
                                                <span>${item.val}%</span>
                                            </div>
                                            <div style="width: 100%; background: var(--border); height: 8px; border-radius: 4px; overflow: hidden;">
                                                <div style="background: ${item.color}; height: 100%; width: ${item.val}%; border-radius: 4px; transition: width 0.6s ease;"></div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div style="background: rgba(99, 102, 241, 0.03); border: 1px solid var(--border); border-radius: 8px; padding: 18px; display: flex; flex-direction: column; justify-content: center; gap: 8px;">
                                    <strong style="font-size: 0.85rem; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em;">Auditor Action Needed</strong>
                                    <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.5;">${escapeHTML(readiness.next_level_needs)}</p>
                                </div>
                            </div>
                        </div>

                        <!-- 5. Personalized Roadmap -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                5. 30-Day Personalized Action Plan
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
                                ${["week_1", "week_2", "week_3", "week_4"].map((wk, idx) => `
                                    <div style="background: var(--bg-main); border: 1px solid var(--border); border-top: 4px solid var(--primary); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 10px;">
                                        <strong style="color: var(--text-main); font-size: 0.95rem;">Week ${idx + 1} Planning</strong>
                                        <ul style="padding-left: 16px; margin: 0; font-size: 0.825rem; color: var(--text-sub); display: flex; flex-direction: column; gap: 6px; line-height: 1.4;">
                                            ${(roadmap[wk] || []).map(action => `<li>${escapeHTML(action)}</li>`).join('')}
                                        </ul>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 6 & 7: Insights & Motivation -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex-wrap: wrap;">
                            <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 12px;">
                                <h4 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                    6. AI Insights
                                </h4>
                                <ul style="padding-left: 18px; margin: 0; font-size: 0.85rem; color: var(--text-sub); display: flex; flex-direction: column; gap: 8px; line-height: 1.5;">
                                    ${insights.map(item => `<li>${escapeHTML(item)}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(to bottom right, rgba(99, 102, 241, 0.02), rgba(168, 85, 247, 0.02)); justify-content: center; border: 1px dashed rgba(99,102,241,0.25);">
                                <h4 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                    7. Growth Motivation
                                </h4>
                                <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.6; font-style: italic;">
                                    "${escapeHTML(motivation)}"
                                </p>
                            </div>
                        </div>

                        <!-- 8. Visual Dashboard Suggestions -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                8. Visual Dashboard Cards Recommendations
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
                                ${[
                                    { title: "Achievement Card", text: dbCards.achievement_card || "Setup achievements details" },
                                    { title: "Growth Score Card", text: dbCards.growth_score_card || "Track scores weekly" },
                                    { title: "Interview Readiness Card", text: dbCards.interview_readiness_card || "Monitor placement status" },
                                    { title: "Next Milestone Card", text: dbCards.next_milestone_card || "Reach next level goals" },
                                    { title: "30-Day Roadmap Card", text: dbCards.roadmap_card || "Review action planning daily" },
                                    { title: "Streak Card", text: dbCards.streak_card || "Keep coding consistency" }
                                ].map(card => `
                                    <div style="background: var(--bg-main); border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 4px;">
                                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">${escapeHTML(card.title)}</span>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-main); font-weight: 600; line-height: 1.4;">${escapeHTML(card.text)}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                    </div>
                `;
            } catch(e) {
                codingResultPage.innerHTML = `<p style="color:var(--danger); margin-top:16px;">Failed: ${escapeHTML(e.message)}</p>`;
            } finally {
                codingSubmitBtnPage.textContent = 'Analyze Coding Profiles & DSA';
                codingSubmitBtnPage.disabled = false;
            }
        });
    }

    // Expose trackClick globally for inline onclick handlers
    window.trackClickGlobal = (url, title) => trackClick(url, title, 'click');
});

// ── SKILL DETAIL DRAWER & ICON UTILITIES ─────────────────────────
const SKILL_DATABASE = {
    "HTML5": {
        category: "Frontend Core",
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e34f26" stroke-width="2.2"><path d="M12 2L2 7l1.8 13.5L12 22l8.2-1.5L22 7L12 2z"/><path d="M7 8h10M7.5 12h9M8 16h8"/></svg>`,
        about: {
            overview: "HTML5 is the backbone of modern web application development. It provides semantic page structures, native multimedia audio/video streaming, Web Canvas graphics, accessibility standards, and modern Web APIs.",
            keyConcepts: [
                "Semantic elements (<header>, <article>, <section>, <nav>, <footer>)",
                "Form Validation API & Accessibility ARIA Roles",
                "Client Storage: localStorage vs. sessionStorage vs. IndexedDB",
                "HTML5 Canvas API, SVG & WebSockets",
                "SEO Optimization & Open Graph Metadata"
            ],
            importance: "Foundational prerequisite for every web software engineer. Semantic markup ensures accessibility compliance and search engine discoverability."
        },
        resources: [
            { title: "MDN Web Docs — HTML5 Standard Specifications", url: "https://developer.mozilla.org/en-US/docs/Web/HTML", type: "Official Docs" },
            { title: "W3C Semantic HTML5 & Accessibility Best Practices", url: "https://www.w3schools.com/html/", type: "Tutorial Hub" },
            { title: "HTML5 Semantic Elements Deep-Dive (CSS-Tricks)", url: "https://css-tricks.com/semantic-html5-elements/", type: "Guide" }
        ],
        questions: [
            {
                q: "What is the difference between HTML5 semantic tags and non-semantic tags?",
                a: "Semantic tags like <article>, <section>, and <nav> communicate structural meaning to browsers, search engines, and accessibility tools. Non-semantic tags like <div> and <span> carry no structural meaning."
            },
            {
                q: "What is the difference between localStorage, sessionStorage, and Cookies?",
                a: "localStorage stores data with no expiration until cleared (5-10MB). sessionStorage stores data only for the current tab session. Cookies store small values (4KB) sent with every HTTP request."
            },
            {
                q: "What are data-* attributes in HTML5?",
                a: "data-* attributes allow custom data to be stored directly on HTML tags without using non-standard attributes. Access them in JS using element.dataset.attrName."
            }
        ]
    },
    "CSS3": {
        category: "Styling & Layout",
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1572b6" stroke-width="2.2"><path d="M12 2L2 7l1.8 13.5L12 22l8.2-1.5L22 7L12 2z"/><path d="M7 8h10M7 12h9M7 16h5"/></svg>`,
        about: {
            overview: "CSS3 is the visual design engine of the web. It enables complex 1D Flexbox, 2D Grid layouts, custom CSS variables, responsive media queries, glassmorphism, and GPU-accelerated keyframe animations.",
            keyConcepts: [
                "CSS Box Model (content, padding, border, margin, box-sizing)",
                "Flexbox vs. CSS Grid multi-dimensional layout systems",
                "CSS Custom Properties (--var) & Dynamic Themes",
                "Responsive Mobile-First Architecture & Media Queries",
                "GPU-Accelerated CSS Transitions & @keyframes"
            ],
            importance: "Crucial for building responsive, pixel-perfect user interfaces with 60fps animations and modern aesthetic themes."
        },
        resources: [
            { title: "MDN CSS Layout & Flexbox Masterclass", url: "https://developer.mozilla.org/en-US/docs/Web/CSS", type: "Official Docs" },
            { title: "Complete Guide to CSS Grid Layouts (CSS-Tricks)", url: "https://css-tricks.com/snippets/css/a-guide-to-grid/", type: "Interactive Guide" },
            { title: "Flexbox Froggy — Interactive Practice Game", url: "https://flexboxfroggy.com/", type: "Practice Sandbox" }
        ],
        questions: [
            {
                q: "Explain the CSS Box Model and box-sizing: border-box.",
                a: "The box model includes content, padding, border, and margin. Setting box-sizing: border-box includes padding and border in width/height calculations, eliminating unexpected layout breaks."
            },
            {
                q: "When should you use Flexbox vs. CSS Grid?",
                a: "Use Flexbox for 1-dimensional layouts (a single row or column, such as navbars). Use CSS Grid for 2-dimensional layouts (rows and columns simultaneously, like dashboard grids)."
            },
            {
                q: "How does CSS Specificity work?",
                a: "Specificity ranks rules by score: Inline styles (1000) > IDs (100) > Classes/Attributes/Pseudo-classes (10) > Elements (1). Higher scores override lower ones."
            }
        ]
    },
    "JavaScript": {
        category: "Scripting Engine",
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f7df1e" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M16 16v-4a2 2 0 0 0-2-2"/><path d="M10 16v-2a1 1 0 0 0-1-1H7"/></svg>`,
        about: {
            overview: "JavaScript ES6+ is the primary programming language of web application development. It powers asynchronous API requests, DOM tree manipulation, event loops, closures, and single-page app frameworks.",
            keyConcepts: [
                "ES6+ Syntax (Arrow Functions, Promises, Async/Await, Destructuring)",
                "Lexical Scope, Closures & Execution Contexts",
                "The JavaScript Event Loop, Call Stack & Microtask Queue",
                "Prototypal Inheritance & Object-Oriented JS",
                "DOM Manipulation, Event Bubbling & Delegation"
            ],
            importance: "The mandatory language powering modern full-stack web engineering across client-side frameworks (React, Vue) and server runtimes (Node.js)."
        },
        resources: [
            { title: "JavaScript.info — The Modern JavaScript Tutorial", url: "https://javascript.info/", type: "Comprehensive Guide" },
            { title: "MDN JavaScript Reference", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", type: "Official Docs" },
            { title: "You Don't Know JS Yet (Book Series)", url: "https://github.com/getify/You-Dont-Know-JS", type: "Advanced Book" }
        ],
        questions: [
            {
                q: "What is a closure in JavaScript?",
                a: "A closure is a function bundled together with references to its surrounding lexical state. It allows an inner function to access outer scope variables even after the outer function has returned."
            },
            {
                q: "How does the Event Loop work in JavaScript?",
                a: "JS runs synchronously on a single Call Stack. Async operations (fetch, timers) run via Web APIs. Resolved Promise microtasks and timer macrotasks wait in queues until the Event Loop pushes them to an empty stack."
            },
            {
                q: "What is the difference between == and ===?",
                a: "== checks equality with automatic type coercion (converts types first). === checks strict equality without type coercion (both type and value must match)."
            }
        ]
    },
    "React": {
        category: "Frontend UI Library",
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#61dafb" stroke-width="2.2"><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="2" fill="#61dafb"/></svg>`,
        about: {
            overview: "React is a declarative component-based UI library. It utilizes Virtual DOM diffing, JSX, state hooks, and unidirectional data flow to build fast, scalable single-page web applications.",
            keyConcepts: [
                "JSX Syntax & Virtual DOM Reconciliation (React Fiber Engine)",
                "Hooks Architecture (useState, useEffect, useMemo, useCallback)",
                "Component Lifecycle & Custom Hooks patterns",
                "State Management (Context API, Redux Toolkit, Zustand)",
                "SSR, SSG & Server Components (Next.js Paradigm)"
            ],
            importance: "The leading enterprise frontend library requested by top tech companies, enabling reusable UI component architectures and declarative state management."
        },
        resources: [
            { title: "React Official Documentation (react.dev)", url: "https://react.dev/", type: "Official Docs" },
            { title: "React Developer Roadmap & Best Practices", url: "https://react.dev/learn", type: "Interactive Guide" },
            { title: "Redux Toolkit Official State Management Guide", url: "https://redux-toolkit.js.org/", type: "State Management" }
        ],
        questions: [
            {
                q: "What is the Virtual DOM and how does React reconciliation work?",
                a: "The Virtual DOM is an in-memory light copy of the real DOM. When state changes, React creates a new Virtual DOM tree, diffs it against the old one using the Fiber reconciliation algorithm, and updates only modified real DOM nodes."
            },
            {
                q: "What is the difference between useMemo and useCallback?",
                a: "useMemo memoizes the *computed result* of a function. useCallback memoizes the *function instance* itself to avoid unnecessary child component re-renders."
            },
            {
                q: "Why shouldn't you mutate state directly in React?",
                a: "Directly mutating state bypasses React's state tracking, preventing the component from re-rendering. Always use setter functions or immutable updates."
            }
        ]
    },
    "Tailwind CSS": {
        category: "Utility CSS Framework",
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2"><path d="M12 4.5C7 4.5 3.5 8 3.5 8S6.5 7 9 7c3.5 0 5.5 3.5 7.5 3.5 3 0 4-1.5 4-1.5S18 10.5 16 10.5c-3.5 0-5.5-3.5-7.5-3.5-2.5 0-4.5 1.5-6.5 1.5"/></svg>`,
        about: {
            overview: "Tailwind CSS is a utility-first CSS framework providing low-level styling classes (flex, pt-4, bg-slate-900) to compose custom UI designs directly in HTML without writing custom CSS files.",
            keyConcepts: [
                "Utility-First Atomic CSS Architecture",
                "Responsive Design Modifiers (sm:, md:, lg:, xl:)",
                "JIT (Just-In-Time) On-Demand Class Compilation",
                "Dark Mode Strategies (dark: modifier)",
                "Theme Customization & Tailwind Config Tokens"
            ],
            importance: "Speeds up UI design cycles, enforces cohesive design tokens, and produces extremely small CSS bundle sizes for high-performance web apps."
        },
        resources: [
            { title: "Tailwind CSS Official Documentation", url: "https://tailwindcss.com/docs", type: "Official Docs" },
            { title: "Tailwind Play Online Sandbox Environment", url: "https://play.tailwindcss.com/", type: "Online Sandbox" }
        ],
        questions: [
            {
                q: "What are the benefits of Utility-First CSS over traditional BEM CSS?",
                a: "Utility-first CSS avoids naming fatigue, keeps CSS bundle size fixed regardless of app scale, and keeps styles localized to markup so edits don't cause unintended side effects."
            },
            {
                q: "How does the Tailwind CSS JIT (Just-In-Time) engine work?",
                a: "The JIT engine scans your files and generates CSS classes on-demand at build time rather than compiling a static library, resulting in sub-10KB production CSS files."
            }
        ]
    }
};

function getSkillIconSvg(skillName) {
    if (!skillName) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;
    const s = skillName.trim();
    if (SKILL_DATABASE[s] && SKILL_DATABASE[s].iconSvg) {
        return SKILL_DATABASE[s].iconSvg;
    }
    const lower = s.toLowerCase();
    if (lower.includes('git')) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f05032" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M6 8v8"/><path d="M8.5 7.5L10 10.5"/></svg>`;
    } else if (lower.includes('python')) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3776ab" stroke-width="2.2"><path d="M12 2C6.5 2 6 4 6 6v3h6v1H5C3 10 2 11.5 2 14s1 4 4 4h2v-3a3 3 0 0 1 3-3h5c1.5 0 3-1.5 3-3V6c0-2-.5-4-7-4z"/><circle cx="9" cy="4.5" r="1" fill="#3776ab"/></svg>`;
    } else if (lower.includes('node') || lower.includes('express')) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#68a063" stroke-width="2.2"><path d="M12 2l9 5.2v10.4L12 22.8 3 17.6V7.2L12 2z"/><path d="M12 12l9-5.2M12 12v10.8M12 12L3 6.8"/></svg>`;
    } else if (lower.includes('sql') || lower.includes('db') || lower.includes('data')) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
    } else if (lower.includes('cloud') || lower.includes('aws') || lower.includes('docker')) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;
}

function getSkillDetails(skillName) {
    const s = (skillName || "").trim();
    if (SKILL_DATABASE[s]) return SKILL_DATABASE[s];

    const category = s.toLowerCase().includes('git') ? 'Version Control' : s.toLowerCase().includes('css') || s.toLowerCase().includes('html') || s.toLowerCase().includes('react') ? 'Frontend Development' : 'Software Engineering Core';

    return {
        category: category,
        iconSvg: getSkillIconSvg(s),
        about: {
            overview: `${s} is a fundamental skill in modern software engineering. Mastering ${s} empowers developers to build scalable, maintainable, and robust enterprise applications following industry best practices.`,
            keyConcepts: [
                `Core syntax & architectural paradigms of ${s}`,
                `Design patterns & modular component practices`,
                `Performance optimization, debugging & error handling`,
                `Integration with cloud infrastructure & APIs`,
                `Production security & code quality standards`
            ],
            importance: `Essential for technical interview rounds, domain expertise, and engineering high-throughput production applications.`
        },
        resources: [
            { title: `${s} Official Documentation & Guides`, url: "https://developer.mozilla.org/", type: "Official Docs" },
            { title: `${s} Video Masterclass & Tutorials`, url: "https://www.freecodecamp.org/", type: "Video Masterclass" },
            { title: `${s} Interactive Coding Lab & Exercises`, url: "https://github.com/", type: "Interactive Lab" }
        ],
        questions: [
            {
                q: `What are the core concepts of ${s}?`,
                a: `${s} focuses on structured design patterns, clean code principles, performance efficiency, and robust integration with software architectures.`
            },
            {
                q: `How do you debug performance or runtime issues in ${s}?`,
                a: `Use execution profiling, inspect system logs, analyze memory allocation, eliminate redundant operations, and implement caching layers.`
            },
            {
                q: `What are essential best practices when using ${s} in production?`,
                a: `Maintain modularity, write thorough unit tests, follow security guidelines, handle edge cases, and keep code documented for team collaboration.`
            }
        ]
    };
}

let currentActiveSkillName = '';
let currentActiveRoadmapKey = 'fullstack';

const syncRoadmapProgressToSupabase = async () => {
    try {
        const stored = localStorage.getItem('skillpath_skill_statuses');
        const statuses = stored ? JSON.parse(stored) : {};

        let userId = 'anonymous';
        if (window.supabaseClient) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session?.user?.id) {
                userId = session.user.id;
            }
        }

        const skillPills = document.querySelectorAll('.skill-item-pill');
        const total = skillPills.length || Object.keys(statuses).length || 1;
        const completedCount = Object.values(statuses).filter(s => s === 'completed').length;
        const inProgressCount = Object.values(statuses).filter(s => s === 'in_progress').length;

        if (window.supabaseClient) {
            const { error } = await window.supabaseClient
                .from('roadmap_progress')
                .upsert({
                    user_id: userId,
                    roadmap_key: currentActiveRoadmapKey || 'fullstack',
                    skill_statuses: statuses,
                    completed_count: completedCount,
                    in_progress_count: inProgressCount,
                    total_skills: total,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,roadmap_key' });

            if (error) {
                console.warn("[SUPABASE] Roadmap progress sync info:", error.message);
            } else {
                console.log("[SUPABASE] Roadmap progress synced to database.");
            }
        }
    } catch (e) {
        console.error("Failed to sync roadmap progress to Supabase:", e);
    }
};

const loadRoadmapProgressFromSupabase = async (roadmapKey = 'fullstack') => {
    currentActiveRoadmapKey = roadmapKey;
    try {
        let userId = 'anonymous';
        if (window.supabaseClient) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session?.user?.id) {
                userId = session.user.id;
            }

            const { data, error } = await window.supabaseClient
                .from('roadmap_progress')
                .select('skill_statuses')
                .eq('user_id', userId)
                .eq('roadmap_key', roadmapKey)
                .maybeSingle();

            if (data && data.skill_statuses) {
                localStorage.setItem('skillpath_skill_statuses', JSON.stringify(data.skill_statuses));
                document.querySelectorAll('.skill-item-pill').forEach(pill => {
                    const name = pill.getAttribute('data-skill');
                    if (name) {
                        const container = pill.querySelector('.skill-status-container');
                        if (container) {
                            container.innerHTML = getSkillStatusBadgeHtml(name);
                        }
                    }
                });
                if (typeof window.updateRoadmapProgressStatsGlobal === 'function') {
                    window.updateRoadmapProgressStatsGlobal();
                }
            }
        }
    } catch (e) {
        console.warn("Could not load roadmap progress from Supabase:", e);
    }
};

function getSkillStatus(skillName) {
    try {
        const stored = localStorage.getItem('skillpath_skill_statuses');
        const map = stored ? JSON.parse(stored) : {};
        return map[skillName] || 'pending';
    } catch (e) {
        return 'pending';
    }
}

function setSkillStatus(skillName, newStatus) {
    try {
        const stored = localStorage.getItem('skillpath_skill_statuses');
        const map = stored ? JSON.parse(stored) : {};
        map[skillName] = newStatus;
        localStorage.setItem('skillpath_skill_statuses', JSON.stringify(map));
    } catch (e) {
        console.error(e);
    }

    const badgeHtml = getSkillStatusBadgeHtml(skillName);
    document.querySelectorAll(`.skill-status-container`).forEach(el => {
        if (el.getAttribute('data-skill-status-container') === skillName) {
            el.innerHTML = badgeHtml;
        }
    });

    const drawer = document.getElementById('skill-detail-drawer');
    if (drawer) {
        drawer.querySelectorAll('.status-select-btn').forEach(btn => {
            if (btn.getAttribute('data-status') === newStatus) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    if (typeof window.updateRoadmapProgressStatsGlobal === 'function') {
        window.updateRoadmapProgressStatsGlobal();
    }

    // Fire & forget sync to Supabase database
    syncRoadmapProgressToSupabase();
}

function getSkillStatusBadgeHtml(skillName) {
    const st = getSkillStatus(skillName);
    if (st === 'completed') {
        return `<span class="skill-status-badge completed" title="Status: Completed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Completed</span>`;
    } else if (st === 'in_progress') {
        return `<span class="skill-status-badge in_progress" title="Status: In Progress"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> In Progress</span>`;
    } else {
        return `<span class="skill-status-badge pending" title="Status: Pending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg> Pending</span>`;
    }
}

function redirectToYouTubeStudying(skillName) {
    closeSkillDetailDrawer();
    const targetSkill = skillName || currentActiveSkillName || 'HTML5';
    const learningTabBtn = document.getElementById('btn-sidebar-learning');
    const skillInput = document.getElementById('skill-input');
    if (learningTabBtn) {
        learningTabBtn.click();
        if (skillInput) {
            skillInput.value = targetSkill;
        }
        const ctaBtn = document.getElementById('cta-button');
        if (ctaBtn) {
            ctaBtn.click();
        } else if (typeof handleSearch === 'function') {
            handleSearch();
        }
    }
}

function openSkillDetailDrawer(skillName) {
    const drawer = document.getElementById('skill-detail-drawer');
    const backdrop = document.getElementById('skill-drawer-backdrop');
    if (!drawer || !backdrop) return;

    currentActiveSkillName = skillName;
    const data = getSkillDetails(skillName);
    const curStatus = getSkillStatus(skillName);

    const titleEl = document.getElementById('skill-drawer-title');
    const catEl = document.getElementById('skill-drawer-category');
    const iconBox = document.getElementById('skill-drawer-icon-box');

    if (titleEl) titleEl.textContent = skillName;
    if (catEl) {
        catEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:8px;">
                <span>${escapeHTML(data.category || 'Core Skill')}</span>
                <div class="skill-drawer-status-bar" style="display: inline-flex; align-items: center; gap: 6px;">
                    <button class="status-select-btn ${curStatus==='pending'?'active':''}" data-status="pending" onclick="setSkillStatus('${escapeHTML(skillName)}', 'pending')">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>
                        Pending
                    </button>
                    <button class="status-select-btn ${curStatus==='in_progress'?'active':''}" data-status="in_progress" onclick="setSkillStatus('${escapeHTML(skillName)}', 'in_progress')">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        In Progress
                    </button>
                    <button class="status-select-btn ${curStatus==='completed'?'active':''}" data-status="completed" onclick="setSkillStatus('${escapeHTML(skillName)}', 'completed')">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                        Completed
                    </button>
                </div>
            </div>
        `;
    }
    if (iconBox) iconBox.innerHTML = data.iconSvg || getSkillIconSvg(skillName);

    const aboutPane = document.getElementById('skill-tab-content-about');
    if (aboutPane) {
        aboutPane.innerHTML = `
            <div style="margin-bottom: 24px;">
                <div style="font-size: 0.8rem; font-weight: 800; color: #a855f7; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Overview</div>
                <p style="font-size: 0.95rem; color: #e2e8f0; line-height: 1.65; margin: 0;">
                    ${escapeHTML(data.about.overview)}
                </p>
            </div>

            <div style="margin-bottom: 24px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 20px;">
                <div style="font-size: 0.8rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Key Concepts to Master
                </div>
                <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 0.9rem; line-height: 1.7;">
                    ${data.about.keyConcepts.map(kc => `<li>${escapeHTML(kc)}</li>`).join('')}
                </ul>
            </div>

            <div style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 14px; padding: 18px 20px;">
                <div style="font-size: 0.8rem; font-weight: 800; color: #c084fc; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Why It Matters for Your Career</div>
                <p style="font-size: 0.88rem; color: #e2e8f0; line-height: 1.6; margin: 0;">
                    ${escapeHTML(data.about.importance)}
                </p>
            </div>
        `;
    }

    const resPane = document.getElementById('skill-tab-content-resources');
    if (resPane) {
        resPane.innerHTML = `
            <!-- Redirection Banner to YouTube Studying Section -->
            <div class="yt-study-redirect-banner" onclick="redirectToYouTubeStudying('${escapeHTML(skillName)}')">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: #ff0000; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 18px rgba(255,0,0,0.5); flex-shrink: 0;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    </div>
                    <div>
                        <div style="font-size: 1rem; font-weight: 800; color: #ffffff;">YouTube Studying Masterclass</div>
                        <div style="font-size: 0.8rem; color: #fca5a5;">Open interactive video courses & playlists for ${escapeHTML(skillName)}</div>
                    </div>
                </div>
                <span style="font-size: 0.85rem; font-weight: 800; color: #ffffff; background: rgba(255,255,255,0.18); padding: 8px 16px; border-radius: 8px; white-space: nowrap;">
                    Study Now ➔
                </span>
            </div>

            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.8rem; font-weight: 800; color: #a855f7; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px;">Documentation & Practice Guides</div>
                ${data.resources.map(r => `
                    <a href="${escapeHTML(r.url)}" target="_blank" rel="noopener noreferrer" class="skill-resource-card">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); display: flex; align-items: center; justify-content: center; color: #60a5fa;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </div>
                            <div>
                                <div style="font-size: 0.92rem; font-weight: 700; color: #ffffff; margin-bottom: 2px;">${escapeHTML(r.title)}</div>
                                <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px;">${escapeHTML(r.type)}</span>
                            </div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </a>
                `).join('')}
            </div>
        `;
    }

    const qPane = document.getElementById('skill-tab-content-questions');
    if (qPane) {
        qPane.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.8rem; font-weight: 800; color: #a855f7; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px;">High-Frequency Technical Interview Questions</div>
                ${data.questions.map((item, idx) => `
                    <div class="skill-faq-card">
                        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
                            <span style="font-size: 0.8rem; font-weight: 900; color: #a855f7; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 6px; padding: 2px 8px; flex-shrink: 0; margin-top: 2px;">Q${idx + 1}</span>
                            <h4 style="font-size: 0.96rem; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.45;">${escapeHTML(item.q)}</h4>
                        </div>
                        <div style="background: rgba(0, 0, 0, 0.3); border-left: 3px solid #10b981; border-radius: 0 8px 8px 0; padding: 12px 16px; margin-left: 34px;">
                            <p style="font-size: 0.88rem; color: #cbd5e1; margin: 0; line-height: 1.6;">${escapeHTML(item.a)}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const tabs = drawer.querySelectorAll('.skill-tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    const aboutTab = drawer.querySelector('.skill-tab-btn[data-tab="about"]');
    if (aboutTab) aboutTab.classList.add('active');

    if (aboutPane) aboutPane.style.display = 'block';
    if (resPane) resPane.style.display = 'none';
    if (qPane) qPane.style.display = 'none';

    drawer.classList.add('open');
    backdrop.classList.add('open');
}

function closeSkillDetailDrawer() {
    const drawer = document.getElementById('skill-detail-drawer');
    const backdrop = document.getElementById('skill-drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
}

// Bind Skill Detail Drawer global handlers
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-skill-drawer-btn');
    const backdrop = document.getElementById('skill-drawer-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeSkillDetailDrawer);
    if (backdrop) backdrop.addEventListener('click', closeSkillDetailDrawer);

    const drawer = document.getElementById('skill-detail-drawer');
    if (drawer) {
        const tabBtns = drawer.querySelectorAll('.skill-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                if (targetTab === 'resources') {
                    // Redirect directly into YouTube studying section when user presses Resources
                    redirectToYouTubeStudying(currentActiveSkillName);
                    return;
                }
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const panes = drawer.querySelectorAll('.skill-tab-pane');
                panes.forEach(p => p.style.display = 'none');

                const activePane = document.getElementById(`skill-tab-content-${targetTab}`);
                if (activePane) activePane.style.display = 'block';
            });
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSkillDetailDrawer();
    });
});

