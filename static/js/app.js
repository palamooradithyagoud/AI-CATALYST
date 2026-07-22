/**
 * SkillRecommender — Premium SaaS Frontend Logic
 * Strictly Vanilla JS (no frameworks)
 */

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
                btnEl.textContent = '💾 Save';
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
                btnEl.textContent = '⏳ Loading...';
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
                btnEl.textContent = '✅ Saved';
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
                if (mainCheckLabel) mainCheckLabel.textContent = playlist.completed ? '✅ Done' : 'Mark Done';

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
            btn.textContent = '💾 Save';
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
                ? `<span class="pill-badge status-verified-badge" style="background:rgba(16, 185, 129, 0.15); color:var(--success); font-size:0.75rem; font-weight:700; padding:5px 12px; border-radius:99px; display:inline-flex; align-items:center; gap:4px;">✅ Completed</span>`
                : (completedCount > 0
                    ? `<span class="pill-badge status-progress-badge" style="background:rgba(56, 189, 248, 0.15); color:#38bdf8; font-size:0.75rem; font-weight:700; padding:5px 12px; border-radius:99px; display:inline-flex; align-items:center; gap:4px;">🛡️ ${progressPct}% Verified</span>`
                    : `<span class="pill-badge status-pending-badge" style="background:var(--bg-main); color:var(--text-muted); border:1px solid var(--border); font-size:0.75rem; font-weight:600; padding:5px 12px; border-radius:99px; display:inline-flex; align-items:center; gap:4px;">⏳ Not Started</span>`);

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
                        <button class="btn-watch btn-open-player" data-url="${escapeHTML(p.url)}" style="padding: 6px 14px; font-size: 0.75rem; border-radius: var(--radius-sm); border:none; cursor:pointer; font-weight:700; background:var(--primary); color:#fff;">▶ Watch</button>
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
                            ▼ Show Videos (${totalCount})
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
                            <button class="btn-play-video-item btn-watch" style="padding:4px 10px; font-size:0.7rem; border-radius:4px; font-weight:700;">▶ Play</button>
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
                    toggleBtn.textContent = `▼ Show Videos (${totalCount})`;
                } else {
                    videosList.style.display = 'flex';
                    toggleBtn.setAttribute('data-expanded', 'true');
                    toggleBtn.textContent = `▲ Hide Videos`;
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
                <span class="item-index">${idx === currentVideoIndex ? '▶' : `#${idx + 1}`}</span>
                <span class="item-title">${escapeHTML(v.title)}</span>
                <span class="item-status">${v.completed ? '✅' : '⏳'}</span>
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

        const vidTitle = document.getElementById('player-current-video-title');
        const vidDesc = document.getElementById('player-current-video-desc');
        if (vidTitle) vidTitle.textContent = `${video.displayNum || (currentVideoIndex + 1)}. ${video.title}`;
        if (vidDesc) vidDesc.textContent = `Part of ${currentPlaylist.title} by ${currentPlaylist.channel}`;

        renderPlayerHeader();
        renderPlayerSidebar();

        let ytId = video.videoId || extractYouTubeVideoId(video.url || currentPlaylist.url);
        if (!ytId) {
            ytId = 'dQw4w9WgXcQ';
        }

        if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
            try {
                ytPlayer.loadVideoById({ videoId: ytId });
            } catch(e) {
                console.error("YT Player loadVideoById failed:", e);
            }
        } else if (window.YT && window.YT.Player) {
            try {
                ytPlayer = new YT.Player('yt-player-anchor', {
                    height: '100%',
                    width: '100%',
                    videoId: ytId,
                    playerVars: {
                        autoplay: 1,
                        modestbranding: 1,
                        rel: 0
                    },
                    events: {
                        onReady: onYTPlayerReady,
                        onStateChange: onYTPlayerStateChange
                    }
                });
            } catch(e) {
                console.error("YT.Player init failed:", e);
            }
        } else {
            window.onYouTubeIframeAPIReady = () => {
                try {
                    ytPlayer = new YT.Player('yt-player-anchor', {
                        height: '100%',
                        width: '100%',
                        videoId: ytId,
                        playerVars: {
                            autoplay: 1,
                            modestbranding: 1,
                            rel: 0
                        },
                        events: {
                            onReady: onYTPlayerReady,
                            onStateChange: onYTPlayerStateChange
                        }
                    });
                } catch(e) {}
            };
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
            if (btnResume) btnResume.textContent = `▶ Continue watching from ${formatted}`;
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

        showToast(`🎉 Video #${video.id} Completed Automatically!`);

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
                { key: 'beginner', label: '🌱 Beginner Phase' },
                { key: 'intermediate', label: '🔥 Intermediate Phase' },
                { key: 'advanced', label: '🚀 Advanced Phase' },
                { key: 'projects', label: '🛠️ Projects to Build' },
                { key: 'certifications', label: '🏆 Recommended Certifications' },
                { key: 'interview_prep', label: '💼 Interview Prep Focus' }
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
                <span style="font-size:1.6rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.05));">🏆</span>
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
                <div style="font-size:2rem; background:rgba(37,99,235,0.08); width:52px; height:52px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">🏆</div>
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
                tierIndicator.textContent = '⚡ Instant Result: Retrieved from AI Memory';
            } else if (data.tier === 1) {
                tierIndicator.textContent = '🚀 Curated Result: Trusted CSV Dataset';
            } else if (data.tier >= 3) {
                tierIndicator.textContent = '🧠 AI-Ranked Result: Groq Intelligence Engine';
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
                emptyState.innerHTML = `<p style="color: var(--danger); font-size: 1.1rem; font-weight: 500;">❌ ${escapeHTML(error.message)}</p>`;
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
        const saveBtnLabel = isSaved ? '✅ Saved' : '💾 Save';
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
            <p class="card-desc" style="margin-top: 10px;"><strong>💡 Why:</strong> ${escapeHTML(data.why_selected)}</p>
            <p class="card-desc"><strong>⏱️ Time:</strong> ${escapeHTML(data.estimated_time)} | <strong>🎯 Outcome:</strong> ${escapeHTML(data.expected_outcome)}</p>
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
                            🗺️ Track this Learning Roadmap
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
                    { key: 'beginner', label: '🌱 Beginner Phase' },
                    { key: 'intermediate', label: '🔥 Intermediate Phase' },
                    { key: 'advanced', label: '🚀 Advanced Phase' },
                    { key: 'projects', label: '🛠️ Projects to Build' },
                    { key: 'certifications', label: '🏆 Recommended Certifications' },
                    { key: 'interview_prep', label: '💼 Interview Prep Focus' }
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
        const saveBtnLabel = isSaved ? '✅ Saved' : '💾 Save';
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
        // Two Pointers (Level 1 requested question list)
        { id: "26", title: "Remove Duplicates from Sorted Array", url: "https://leetcode.com/problems/remove-duplicates-from-sorted-array/", difficulty: "Easy", topic: "Two Pointers", pattern: "Slow & Fast Pointer" },
        { id: "27", title: "Remove Element", url: "https://leetcode.com/problems/remove-element/", difficulty: "Easy", topic: "Two Pointers", pattern: "Slow & Fast Pointer" },
        { id: "283", title: "Move Zeroes", url: "https://leetcode.com/problems/move-zeroes/", difficulty: "Easy", topic: "Two Pointers", pattern: "Slow & Fast Pointer" },
        { id: "88", title: "Merge Sorted Array", url: "https://leetcode.com/problems/merge-sorted-array/", difficulty: "Easy", topic: "Two Pointers", pattern: "Two Pointers from End" },
        { id: "977", title: "Squares of a Sorted Array", url: "https://leetcode.com/problems/squares-of-a-sorted-array/", difficulty: "Easy", topic: "Two Pointers", pattern: "Left & Right Pointer" },
        { id: "905", title: "Sort Array By Parity", url: "https://leetcode.com/problems/sort-array-by-parity/", difficulty: "Easy", topic: "Two Pointers", pattern: "Partitioning" },

        // Arrays
        { id: "1", title: "Two Sum", url: "https://leetcode.com/problems/two-sum/", difficulty: "Easy", topic: "Arrays", pattern: "Hash Map Lookup" },
        { id: "217", title: "Contains Duplicate", url: "https://leetcode.com/problems/contains-duplicate/", difficulty: "Easy", topic: "Arrays", pattern: "Frequency Map" },
        { id: "242", title: "Valid Anagram", url: "https://leetcode.com/problems/valid-anagram/", difficulty: "Easy", topic: "Arrays", pattern: "Frequency Map" },
        { id: "121", title: "Best Time to Buy and Sell Stock", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/", difficulty: "Easy", topic: "Arrays", pattern: "Sliding Window" },
        { id: "169", title: "Majority Element", url: "https://leetcode.com/problems/majority-element/", difficulty: "Easy", topic: "Arrays", pattern: "Boyer-Moore Voting" },
        { id: "268", title: "Missing Number", url: "https://leetcode.com/problems/missing-number/", difficulty: "Easy", topic: "Arrays", pattern: "Bit Manipulation" },

        // Sliding Window
        { id: "121", title: "Best Time to Buy and Sell Stock", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/", difficulty: "Easy", topic: "Sliding Window", pattern: "Dynamic Window" },
        { id: "643", title: "Maximum Average Subarray I", url: "https://leetcode.com/problems/maximum-average-subarray-i/", difficulty: "Easy", topic: "Sliding Window", pattern: "Fixed Size Window" },

        // Prefix Sum
        { id: "303", title: "Range Sum Query - Immutable", url: "https://leetcode.com/problems/range-sum-query-immutable/", difficulty: "Easy", topic: "Prefix Sum", pattern: "Prefix Array" },
        { id: "724", title: "Find Pivot Index", url: "https://leetcode.com/problems/find-pivot-index/", difficulty: "Easy", topic: "Prefix Sum", pattern: "Pivot Balancing" },

        // Kadane's Algorithm
        { id: "53", title: "Maximum Subarray", url: "https://leetcode.com/problems/maximum-subarray/", difficulty: "Medium", topic: "Kadane's Algorithm", pattern: "Dynamic Subarray Max" },

        // Strings
        { id: "14", title: "Longest Common Prefix", url: "https://leetcode.com/problems/longest-common-prefix/", difficulty: "Easy", topic: "Strings", pattern: "Vertical Scan" },
        { id: "20", title: "Valid Parentheses", url: "https://leetcode.com/problems/valid-parentheses/", difficulty: "Easy", topic: "Strings", pattern: "Stack Matching" },
        { id: "28", title: "Find Index of First Occurrence in String", url: "https://leetcode.com/problems/find-the-index-of-the-first-occurrence-in-a-string/", difficulty: "Easy", topic: "Strings", pattern: "Sub-string Search" },

        // Hashmap
        { id: "1", title: "Two Sum", url: "https://leetcode.com/problems/two-sum/", difficulty: "Easy", topic: "Hashmap", pattern: "Key-Value Lookup" },
        { id: "383", title: "Ransom Note", url: "https://leetcode.com/problems/ransom-note/", difficulty: "Easy", topic: "Hashmap", pattern: "Char Frequency Map" },

        // Binary Search
        { id: "704", title: "Binary Search", url: "https://leetcode.com/problems/binary-search/", difficulty: "Easy", topic: "Binary Search", pattern: "Classic Binary Search" },
        { id: "35", title: "Search Insert Position", url: "https://leetcode.com/problems/search-insert-position/", difficulty: "Easy", topic: "Binary Search", pattern: "Lower / Upper Bound" },
        { id: "278", title: "First Bad Version", url: "https://leetcode.com/problems/first-bad-version/", difficulty: "Easy", topic: "Binary Search", pattern: "Boolean Condition Search" },
        { id: "69", title: "Sqrt(x)", url: "https://leetcode.com/problems/sqrtx/", difficulty: "Easy", topic: "Binary Search", pattern: "Binary Search on Answers" },
        { id: "74", title: "Search a 2D Matrix", url: "https://leetcode.com/problems/search-a-2d-matrix/", difficulty: "Medium", topic: "Binary Search", pattern: "2D Matrix Search" }
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
            if (topicName === "All" || topicName === "Foundation") return true;
            if (q.topic === topicName || (topicName.includes("Two Pointer") && q.topic.includes("Two Pointer"))) return true;
            return false;
        });

        const solvedCount = filtered.filter(q => solvedList.some(s => s.link === q.url)).length;
        const totalCount = filtered.length;
        const pct = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;

        if (countEl) countEl.textContent = `(${solvedCount} / ${totalCount})`;
        if (fillEl) fillEl.style.width = `${pct}%`;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding: 30px; color:#64748b;">
                        No questions available for ${escapeHTML(topicName)}.
                    </td>
                </tr>
            `;
        } else {
            filtered.forEach((q, idx) => {
                const tr = document.createElement('tr');
                const isSolved = solvedList.some(s => s.link === q.url);

                tr.innerHTML = `
                    <td style="padding:14px 16px; text-align:center; font-weight:700; color:#64748b; font-size:0.85rem;">${idx + 1}</td>
                    <td style="padding:14px 16px; font-weight:700; color:#3b82f6; font-size:0.9rem;">${escapeHTML(q.id)}</td>
                    <td style="padding:14px 16px;">
                        <a href="${q.url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-weight:600; font-size:0.9rem; text-decoration:none; display:inline-flex; align-items:center; gap:6px; transition:color 0.2s ease;">
                            ${escapeHTML(q.title)}
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#3b82f6" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                    </td>
                    <td style="padding:14px 16px; color:#94a3b8; font-size:0.8rem;">
                        <span style="background:rgba(59,130,246,0.14); color:#60a5fa; padding:4px 10px; border-radius:6px; border:1px solid rgba(59,130,246,0.3); font-weight:600; display:inline-block; white-space:nowrap;">
                            ${escapeHTML(q.pattern || 'Two Pointers')}
                        </span>
                    </td>
                    <td style="padding:14px 16px; text-align:center;">
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

    // Node click handlers on Roadmap Tree
    document.querySelectorAll('.roadmap-node').forEach(node => {
        node.addEventListener('click', () => {
            document.querySelectorAll('.roadmap-node').forEach(n => n.classList.remove('active-node'));
            node.classList.add('active-node');
            const title = node.getAttribute('data-title');
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
                    <span class="solve-label">${isSolved ? '✅ Solved' : 'Mark as Solved'}</span>
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
                card.querySelector('.solve-label').textContent = e.target.checked ? '✅ Solved' : 'Mark as Solved';
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
        if (data) {
            document.getElementById('dashboard-resume-score').textContent = `${data.score}/100`;
            const verdictEl = document.getElementById('dashboard-resume-verdict');
            verdictEl.textContent = data.verdict;
            verdictEl.className = 'score-verdict';
            if (data.verdict.toLowerCase().includes('reject') || data.verdict.toLowerCase().includes('no')) {
                verdictEl.classList.add('text-danger');
            } else if (data.verdict.toLowerCase().includes('borderline')) {
                verdictEl.classList.add('text-warning');
            } else {
                verdictEl.classList.add('text-success');
            }
            document.getElementById('dashboard-resume-impact').textContent = data.impact;
            document.getElementById('dashboard-resume-skills').textContent = data.match;
            document.getElementById('dashboard-resume-ats').textContent = typeof data.ats === 'number' ? `${data.ats}%` : data.ats;
        } else {
            // No resume uploaded yet — show empty state
            document.getElementById('dashboard-resume-score').textContent = '—/100';
            const verdictEl = document.getElementById('dashboard-resume-verdict');
            verdictEl.textContent = 'Not analyzed yet';
            verdictEl.className = 'score-verdict';
            document.getElementById('dashboard-resume-impact').textContent = '—';
            document.getElementById('dashboard-resume-skills').textContent = '—';
            document.getElementById('dashboard-resume-ats').textContent = '—';
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
            showToast('✅ Project added successfully!');
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
        } else if (targetViewId === 'view-projects') {
            loadProjects();
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

    // Dashboard Buttons Action Link
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
            mentorResultPage.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="color:var(--text-sub);">⚡ Analyzing your path...</p></div>';

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
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">⚠️ Where you are lagging behind:</p>
                        <ul style="padding-left:16px; color:var(--danger); font-size:0.85rem; margin-bottom:12px;">
                            ${data.lagging_areas.map(area => `<li>${escapeHTML(area)}</li>`).join('')}
                        </ul>` : ''}
                        ${ data.wasted_time && data.wasted_time.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:4px; font-weight:600;">⛔ Stop wasting time on:</p>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
                            ${data.wasted_time.map(s => `<span class="pill-badge" style="background:#fee2e2;color:#ef4444;border-color:transparent;">${escapeHTML(s)}</span>`).join('')}
                        </div>` : ''}
                        ${ data.must_learn_now && data.must_learn_now.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">✅ Learn these NOW:</p>
                        <ul style="padding-left:16px; color:var(--text-main); font-size:0.85rem; margin-bottom:12px;">
                            ${data.must_learn_now.map(i => `<li><strong>${escapeHTML(i.skill)}</strong> — ${escapeHTML(i.reason)}</li>`).join('')}
                        </ul>` : ''}
                        ${ data.improvement_suggestions && data.improvement_suggestions.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">💡 How to do it better:</p>
                        <ul style="padding-left:16px; color:var(--text-main); font-size:0.85rem; margin-bottom:12px; line-height:1.5;">
                            ${data.improvement_suggestions.map(s => `<li><strong>${escapeHTML(s.action)}</strong> — ${escapeHTML(s.how_to_do_better)}</li>`).join('')}
                        </ul>` : ''}
                        <p style="color:var(--text-sub); font-size:0.85rem; line-height:1.6; margin-bottom:12px;">
                            ${escapeHTML(data.brutal_truth)}
                        </p>
                        <div style="background:var(--primary-light); border-left:3px solid var(--primary); padding:12px 16px; border-radius:8px;">
                            <p style="color:var(--primary); font-size:0.85rem; margin:0; font-weight:600;">🎯 This week: ${escapeHTML(data.action_this_week)}</p>
                        </div>
                    </div>
                `;
            } catch(e) {
                mentorResultPage.innerHTML = `<p style="color:var(--danger);">Failed: ${escapeHTML(e.message)}</p>`;
            } finally {
                mentorSubmitPage.textContent = 'Get Brutal Advice ⚡';
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
        const codeforces = document.getElementById('settings-codeforces')?.value.trim() || "";
        const codementor = document.getElementById('settings-codementor')?.value.trim() || "";

        // Save to local storage for safety/instant feedback
        localStorage.setItem('profile_leetcode', leetcode);
        localStorage.setItem('profile_github', github);
        localStorage.setItem('profile_codeforces', codeforces);
        localStorage.setItem('profile_codementor', codementor);

        // Save to DB via backend endpoint (robust, bypasses client-side RLS issues)
        let dbSaved = false;
        try {
            const res = await fetch('/save-coding-profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leetcode_profile: leetcode,
                    github_profile: github,
                    codeforces_profile: codeforces,
                    codementor_profile: codementor
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    dbSaved = true;
                }
            }
        } catch (e) {
            console.error("Failed to save coding profiles via backend:", e);
        }

        if (dbSaved) {
            showToast('✅ Coding profiles saved successfully to Cloud & local storage!');
        } else {
            showToast('✅ Coding profiles saved locally (Cloud sync failed or pending schema migration).');
        }

        if (leetcode) {
            try {
                showToast('🔄 Fetching live LeetCode stats...');
                const res = await fetch(`/get-leetcode-stats?profile=${encodeURIComponent(leetcode)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status === 'success' && data.stats) {
                        leetcodeStats = data.stats;
                        showToast(`📊 Loaded LeetCode solved count: ${leetcodeStats.All} questions!`);
                    } else {
                        showToast('⚠️ Could not load LeetCode solved count from profile.');
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
            if (banner) banner.textContent = `Welcome back, ${fullname.split(' ')[0]}! 👋`;
        }

        if (dbSaved) {
            showToast('✨ Academic profile updated & synced to Cloud successfully!');
        } else {
            showToast('✨ Academic profile updated locally!');
        }
    };

    // Load Coding & Academic Profiles into Settings Cards
    const loadCodingProfiles = async () => {
        let leetcode = localStorage.getItem('profile_leetcode') || '';
        let github = localStorage.getItem('profile_github') || '';
        let codeforces = localStorage.getItem('profile_codeforces') || '';
        let codementor = localStorage.getItem('profile_codementor') || '';
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
                    .select('full_name, college, department, academic_class, target_role, leetcode_profile, github_profile, codeforces_profile, codementor_profile')
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
                    if (data.codeforces_profile) codeforces = data.codeforces_profile;
                    if (data.codementor_profile) codementor = data.codementor_profile;

                    if (fullname) localStorage.setItem('profile_fullname', fullname);
                    if (college) localStorage.setItem('profile_college', college);
                    if (dept) localStorage.setItem('profile_dept', dept);
                    if (cls) localStorage.setItem('profile_class', cls);
                    if (targetRole) localStorage.setItem('profile_target_role', targetRole);
                    if (leetcode) localStorage.setItem('profile_leetcode', leetcode);
                    if (github) localStorage.setItem('profile_github', github);
                    if (codeforces) localStorage.setItem('profile_codeforces', codeforces);
                    if (codementor) localStorage.setItem('profile_codementor', codementor);
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

        const setValAndSummary = (id, summaryId, val) => {
            setVal(id, val);
            const summaryEl = document.getElementById(summaryId);
            if (summaryEl) {
                summaryEl.textContent = val ? val : "Not configured 🛑";
                summaryEl.style.color = val ? "var(--text-main)" : "var(--danger)";
            }
        };
        setValAndSummary('settings-leetcode', 'summary-leetcode', leetcode);
        setValAndSummary('settings-github', 'summary-github', github);
        setValAndSummary('settings-codeforces', 'summary-codeforces', codeforces);
        setValAndSummary('settings-codementor', 'summary-codementor', codementor);

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
        if (banner) banner.textContent = `Welcome back, ${name.split(' ')[0]}! 👋`;
        
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
            const codeforces = document.getElementById('settings-codeforces')?.value.trim() || localStorage.getItem('profile_codeforces') || "";
            const codementor = document.getElementById('settings-codementor')?.value.trim() || localStorage.getItem('profile_codementor') || "";

            if (!leetcode && !github && !codeforces && !codementor) {
                codingResultPage.innerHTML = `
                    <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:12px; color:#ef4444; font-size:0.85rem; font-weight:600; margin-top:16px;">
                        ⚠️ Please configure at least one coding profile (LeetCode, GitHub, Codeforces, or Codementor) in Settings to execute the analysis.
                    </div>
                `;
                return;
            }

            codingSubmitBtnPage.textContent = 'Auditing coding standing...';
            codingSubmitBtnPage.disabled = true;
            codingResultPage.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="color:var(--text-sub);">⚡ Analyzing coding standings & DSA progress...</p></div>';

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
                        codeforces_profile: codeforces,
                        codementor_profile: codementor
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
                                🔥 Coding Growth Report
                            </h2>
                            <p style="margin: 0; font-size: 0.95rem; opacity: 0.9; font-weight: 500;">
                                Premium Technical Alignment & Placement Readiness Audit
                            </p>
                        </div>

                        <!-- 1. Performance Snapshot -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                📊 1. Performance Snapshot
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
                                🌟 2. Strength Analysis
                            </h3>
                            <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                                ${strengths.map(s => `
                                    <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <strong style="color: var(--success); font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                                            <span>✔</span> ${escapeHTML(s.title)}
                                        </strong>
                                        <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.5;">${escapeHTML(s.why)}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 3. Skill Gap Analysis -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                🎯 3. High-Impact Areas for Growth
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                                <div style="background: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #ef4444; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">🔴 Critical</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.critical || []).map(topic => `<span class="pill-badge" style="background:#fef2f2; color:#ef4444; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                                <div style="background: rgba(245, 158, 11, 0.03); border: 1px solid rgba(245, 158, 11, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #f59e0b; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">🟡 Important</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.important || []).map(topic => `<span class="pill-badge" style="background:#fffbeb; color:#d97706; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                                <div style="background: rgba(59, 130, 246, 0.03); border: 1px solid rgba(59, 130, 246, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #3b82f6; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">🔵 Optional</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.optional || []).map(topic => `<span class="pill-badge" style="background:#eff6ff; color:#2563eb; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. Interview Readiness Assessment -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                💼 4. Interview Readiness Assessment
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
                                🗓 5. 30-Day Personalized Action Plan
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
                                    💡 6. AI Insights
                                </h4>
                                <ul style="padding-left: 18px; margin: 0; font-size: 0.85rem; color: var(--text-sub); display: flex; flex-direction: column; gap: 8px; line-height: 1.5;">
                                    ${insights.map(item => `<li>${escapeHTML(item)}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(to bottom right, rgba(99, 102, 241, 0.02), rgba(168, 85, 247, 0.02)); justify-content: center; border: 1px dashed rgba(99,102,241,0.25);">
                                <h4 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                    ✨ 7. Growth Motivation
                                </h4>
                                <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.6; font-style: italic;">
                                    "${escapeHTML(motivation)}"
                                </p>
                            </div>
                        </div>

                        <!-- 8. Visual Dashboard Suggestions -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                🎴 8. Visual Dashboard Cards Recommendations
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
                                ${[
                                    { title: "Achievement Card", text: dbCards.achievement_card || "🏆 Setup achievements details" },
                                    { title: "Growth Score Card", text: dbCards.growth_score_card || "📈 Track scores weekly" },
                                    { title: "Interview Readiness Card", text: dbCards.interview_readiness_card || "🎯 Monitor placement status" },
                                    { title: "Next Milestone Card", text: dbCards.next_milestone_card || "⚡ Reach next level goals" },
                                    { title: "30-Day Roadmap Card", text: dbCards.roadmap_card || "🗓 Review action planning daily" },
                                    { title: "Streak Card", text: dbCards.streak_card || "🔥 Keep coding consistency" }
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
                codingSubmitBtnPage.textContent = 'Analyze Coding Profiles & DSA ⚡';
                codingSubmitBtnPage.disabled = false;
            }
        });
    }

    // Expose trackClick globally for inline onclick handlers
    window.trackClickGlobal = (url, title) => trackClick(url, title, 'click');
});
