(function () {
    // Const
    const CONSTANTS = {
        AUTO_NEXT_THRESHOLD: 120, // seconds (can be overridden by user setting)
        AUTO_NEXT_PAUSE_DELAY_MS: 3000, // wait this long after pause before auto-next
        CHECK_INTERVAL: 2000,    // milliseconds
        NOTIFICATION_DURATION: 7000,
        NOTIFICATION_FADE_DURATION: 1000,
        VIDEO_LOAD_CHECK_INTERVAL: 500,
        VIDEO_LOAD_TIMEOUT: 10000,
        MIN_VALID_REMAINING_TIME: 10, // Minimum valid remaining time in seconds
        INITIAL_LOAD_DELAY: 3000,     // Delay before starting to track video state
        SKIP_SECONDS: 3,              // Arrow right skip duration (can be overridden)
        SKIP_OPENING_SECONDS: 90,     // Numpad '.' skip duration (opening, can be overridden)
    };

    // debounce function (seems not working)
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Gets anime name from current URL
     * @returns {string} Anime name from the URL
     */
    function getAnimeIdFromUrl() {
        return window.location.pathname.split('/').filter(segment => segment).pop();
    }

    // UI
    const NotificationUI = {
        createNotificationElement: (styles) => {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 15px;
                border-radius: 5px;
                z-index: 9999;
                font-family: Arial, sans-serif;
                max-width: 300px;
            `;
            return notification;
        },

        showEpisodeNotification: (savedData) => {
            const notification = NotificationUI.createNotificationElement();
            notification.innerHTML = `
                <div style="margin-bottom: 8px"><strong>上次睇到:</strong></div>
                <div>第 ${savedData.episode} 集 </div>
                <div>剩返 ${savedData.remainingTime}</div>
            `;
            NotificationUI.showNotification(notification);
        },

        showTextNotification: (text) => {
            const notification = NotificationUI.createNotificationElement();
            notification.innerHTML = `
                <div style="margin-bottom: 8px"><strong>${text}</strong></div>
            `;
            NotificationUI.showNotification(notification, 5000);
        },

        showNotification: (notification, duration = CONSTANTS.NOTIFICATION_DURATION) => {
            document.body.appendChild(notification);
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.5s ease';
                setTimeout(() => notification.remove(), CONSTANTS.NOTIFICATION_FADE_DURATION);
            }, duration);
        }
    };

    // State
    let lastSaved = { title: "", episode: "", remainingTime: "" };
    let isPageVisible = document.visibilityState === 'visible';
    let isInitialLoad = true;
    let hasPerformedInitialScroll = false;
    let hasPerformedAutoNext = false;
    let autoNextCountdownTimeout = null;
    let autoNextCountdownEpisode = null;

    function resetAutoNextCountdown() {
        if (autoNextCountdownTimeout) {
            clearTimeout(autoNextCountdownTimeout);
            autoNextCountdownTimeout = null;
        }
        autoNextCountdownEpisode = null;
    }

    /**
     * Finds the currently active video element
     * @returns {HTMLVideoElement|null}
     */
    function getActiveVideoElement() {
        // Prefer the video that has started and where the user is active
        const activeContainer =
            document.querySelector(".video-js.vjs-has-started.vjs-user-active") ||
            document.querySelector(".video-js.vjs-playing") ||
            document.querySelector(".video-js.vjs-paused");

        return activeContainer ? activeContainer.querySelector("video") : null;
    }

    /**
     * Custom key skips (ArrowRight, ArrowLeft, Numpad '.')
     */
    function handleArrowKeySkip(event) {
        const isRightArrow = event.key === "ArrowRight";
        const isLeftArrow = event.key === "ArrowLeft";
        const isNumpadDecimal =
            event.code === "NumpadDecimal" ||
            event.key === "Decimal" ||
            (event.key === "." && event.location === 3);

        if (!isRightArrow && !isNumpadDecimal && !isLeftArrow) return;

        const videoElement = getActiveVideoElement();
        if (!videoElement) return;

        const beforeTime = videoElement.currentTime || 0;

        // Let the page's own handlers run first, then correct to our desired skip
        setTimeout(() => {
            let delta = 0;
            if (isRightArrow) {
                delta = CONSTANTS.SKIP_SECONDS;
            } else if (isLeftArrow) {
                delta = -CONSTANTS.SKIP_SECONDS;
            } else if (isNumpadDecimal) {
                delta = CONSTANTS.SKIP_OPENING_SECONDS;
            }

            const targetTime = Math.max(0, beforeTime + delta);
            videoElement.currentTime = targetTime;
        }, 0);
    }

    /**
     * Saves the last watched episode data with validation
     */
    function saveLastWatched(title, episode, remainingTime) {
        // Don't save if page is not visible or remaining time is invalid
        if (!isPageVisible || !isValidRemainingTime(remainingTime)) {
            return;
        }

        // Convert remaining time to seconds for comparison
        const remainingSeconds = convertTimeToSeconds(remainingTime);
        
        // Don't save if it's the initial load and the remaining time is near the start
        if (isInitialLoad && remainingSeconds > (videoElement?.duration - CONSTANTS.MIN_VALID_REMAINING_TIME)) {
            return;
        }

        // Avoid duplicate saves
        if (lastSaved.title === title && 
            lastSaved.episode === episode && 
            lastSaved.remainingTime === remainingTime) {
            return;
        }

        lastSaved = { title, episode, remainingTime };
        const animeId = getAnimeIdFromUrl();

        chrome.storage.local.get('animeData', (result) => {
            let animeData = result.animeData || {};
            
            // Don't overwrite with invalid remaining time
            if (animeData[animeId] && !isValidRemainingTime(remainingTime)) {
                return;
            }

            animeData[animeId] = {
                title,
                episode,
                remainingTime,
                lastUpdated: Date.now()
            };

            chrome.storage.local.set({ animeData }, () => {
                console.log(`Saved: ${title} - [${episode}], Remaining Time: ${remainingTime}`);
            });
        });
    }

    /**
     * Validates remaining time format and value
     */
    function isValidRemainingTime(remainingTime) {
        if (!remainingTime || remainingTime.trim() === '') return false;
        
        const seconds = convertTimeToSeconds(remainingTime);
        return seconds >= CONSTANTS.MIN_VALID_REMAINING_TIME;
    }

    /**
     * Converts MM:SS format to seconds
     */
    function convertTimeToSeconds(timeString) {
        const parts = timeString.split(':');
        if (parts.length !== 2) return 0;
        
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseInt(parts[1]) || 0;
        return minutes * 60 + seconds;
    }

    /**
     * Processes video player state and updates episode tracking
     * @param {HTMLElement} videoPlayer - The video player element
     * @param {HTMLElement} article - The parent article element
     */
    function processVideoState(videoPlayer, article) {
        const hasStarted = videoPlayer.classList.contains("vjs-has-started");
        if (!hasStarted) return;

        const isPlaying = videoPlayer.classList.contains("vjs-playing");
        const isPaused = videoPlayer.classList.contains("vjs-paused");
        const playerEnded = videoPlayer.classList.contains("vjs-ended");

        if (!isPlaying && !isPaused && !playerEnded) {
            return;
        }

        const elements = {
            title: article.querySelector("header h2 a"),
            remainingTime: article.querySelector(".vjs-remaining-time-display")
        };

        if (!elements.title || !elements.remainingTime) {
            return;
        }

        const episodeInfo = parseEpisodeInfo(elements.title.textContent.trim(), 
                                           elements.remainingTime.textContent.trim());
        if (!episodeInfo) {
            return;
        }

        console.log(`Detected: ${episodeInfo.title} - [${episodeInfo.episode}], Remaining Time: ${episodeInfo.remainingTime}`);

        handleAutoNextCountdown(episodeInfo, videoPlayer);

        saveLastWatched(episodeInfo.title, episodeInfo.episode, episodeInfo.remainingTime);
    }

    /**
     * Parses episode information from title and remaining time
     * @returns {Object|null} Episode information or null if invalid
     */
    function parseEpisodeInfo(titleText, remainingTime) {
        const match = titleText.match(/(.+?)\s*\[(\d+)\]/);
        if (!match) return null;

        const remainingParts = remainingTime.split(':');
        const remainingSeconds = parseInt(remainingParts[0]) * 60 + parseInt(remainingParts[1]);

        return {
            title: match[1],
            episode: match[2],
            remainingTime: remainingTime.trim(),
            remainingSeconds
        };
    }

    /**
     * Auto-next: when paused with remaining time in threshold, start a fixed delay then go next.
     * Countdown is only cancelled when playback resumes (no longer paused). Timeout does not re-check conditions.
     */
    function handleAutoNextCountdown(episodeInfo, videoPlayer) {
        const isPlaying = videoPlayer.classList.contains("vjs-playing");
        const isPaused = videoPlayer.classList.contains("vjs-paused");
        const playerEnded = videoPlayer.classList.contains("vjs-ended");

        if (playerEnded) {
            resetAutoNextCountdown();
            handleAutoNextEpisode(episodeInfo.episode, false);
            return;
        }

        if (isPlaying) {
            resetAutoNextCountdown();
            return;
        }

        if (!isPaused) {
            return;
        }

        const inThreshold =
            episodeInfo.remainingSeconds <= CONSTANTS.AUTO_NEXT_THRESHOLD &&
            episodeInfo.remainingSeconds !== 0;

        if (!inThreshold) {
            return;
        }

        if (autoNextCountdownTimeout && autoNextCountdownEpisode === episodeInfo.episode) {
            return;
        }

        resetAutoNextCountdown();
        autoNextCountdownEpisode = episodeInfo.episode;
        autoNextCountdownTimeout = setTimeout(() => {
            handleAutoNextEpisode(autoNextCountdownEpisode, false);
            resetAutoNextCountdown();
        }, CONSTANTS.AUTO_NEXT_PAUSE_DELAY_MS);
    }

    /**
     * Handles auto-next episode 
     */
    function handleAutoNextEpisode(currentEpisode, isNewUpdated) {
        chrome.storage.local.get(['autoNextEpisode'], function(settings) {
            if (!settings.autoNextEpisode) return;

            const nextEpisode = parseInt(currentEpisode) + 1;
            const found = findAndPlayNextEpisode(nextEpisode);
            
            NotificationUI.showTextNotification(found ? (isNewUpdated ? "更新左有下集喇" : "開始下一集") : "冇下集了");
        });
    }

    /**
     * Finds and starts playing the next episode
     * @returns {boolean} Whether the next episode was found and started
     */
    function findAndPlayNextEpisode(nextEpisode) {
        const articles = document.querySelectorAll("article");
        
        for (const article of articles) {
            const titleElement = article.querySelector("header h2 a");
            if (!titleElement) continue;

            const match = titleElement.textContent.trim().match(/(.+?)\s*\[(\d+)\]/);
            if (!match || parseInt(match[2]) != nextEpisode) continue;

            console.log(`Auto next episode found: ${nextEpisode}`);
            article.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const videoContainer = article.querySelector(".video-js");
            if (videoContainer) {
                videoContainer.click();
                return true;
            }
        }
        
        return false;
    }

    /**
     * Main function: find current episode
     */
    function findCurrentEpisode() {
        const articles = document.querySelectorAll("article");
        
        for (const article of articles) {
            const videoPlayer = article.querySelector(".video-js");
            if (!videoPlayer) continue;

            // Track playing (with user active) or paused (mouse idle still counts) so auto-next countdown keeps running
            const hasStarted = videoPlayer.classList.contains("vjs-has-started");
            const isActive =
                hasStarted &&
                ((videoPlayer.classList.contains("vjs-playing") &&
                    videoPlayer.classList.contains("vjs-user-active")) ||
                    videoPlayer.classList.contains("vjs-paused"));
            
            
            if (isActive) {
                const observer = new MutationObserver((mutations) => {
                    processVideoState(videoPlayer, article);
                });
                observer.observe(videoPlayer, { 
                    attributes: true, 
                    attributeFilter: ["class"] 
                });
                
                // Also process the initial state
                processVideoState(videoPlayer, article);
                
                // Break after finding the first active episode
                break;
            }
        }
    }

    /**
     * Scrolls to and loads the saved episode
     */
    function scrollToSavedEpisode() {
        // Don't process if page is not visible
        if (!isPageVisible) {
            // Wait for page to become visible
            document.addEventListener('visibilitychange', function onVisibilityChange() {
                if (document.visibilityState === 'visible') {
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                    performScrollAndSeek();
                    hasPerformedInitialScroll = true;
                }
            });
            return;
        }

        performScrollAndSeek();
        hasPerformedInitialScroll = true;
    }

    /**
     * Performs the actual scroll and seek operations
     */
    function performScrollAndSeek() {
        const animeId = getAnimeIdFromUrl();
        
        chrome.storage.local.get('animeData', (result) => {
            const savedData = result.animeData?.[animeId];
            if (!savedData) return;

            const article = findEpisodeArticle(savedData.episode);
            if (!article) return;

            const remainingParts = savedData.remainingTime.split(':');
            const remainingSeconds = parseInt(remainingParts[0]) * 60 + parseInt(remainingParts[1]);


            if (remainingSeconds < CONSTANTS.AUTO_NEXT_THRESHOLD)
                handleAutoNextEpisode(savedData.episode, true);
            else
                scrollAndPlayEpisode(article, savedData);
        });
    }

    /**
     * Finds the article element for a specific episode
     */
    function findEpisodeArticle(targetEpisode) {
        const articles = document.querySelectorAll("article");
        
        return Array.from(articles).find(article => {
            const titleElement = article.querySelector("header h2 a");
            if (!titleElement) return false;

            const match = titleElement.textContent.trim().match(/(.+?)\s*\[(\d+)\]/);
            return match && match[2] === targetEpisode;
        });
    }

    /**
     * Handles scrolling to and playing an episode
     */
    function scrollAndPlayEpisode(article, savedData) {
        article.scrollIntoView({ behavior: 'smooth', block: 'center' });
        NotificationUI.showEpisodeNotification(savedData);

        const videoContainer = article.querySelector(".video-js");
        if (videoContainer) {
            videoContainer.click();
            handleVideoPlayback(videoContainer, savedData);
        }
    }

    /**
     * Handles video playback and seeking to saved position
     */
    function handleVideoPlayback(videoContainer, savedData) {
        // Don't process if page is not visible
        if (!isPageVisible) return;

        try {
            const videoElement = videoContainer.querySelector('video');
            if (!videoElement) {
                console.error('Video element not found');
                return;
            }

            const remainingParts = savedData.remainingTime.split(':');
            const remainingSeconds = parseInt(remainingParts[0]) * 60 + parseInt(remainingParts[1]);
            
            // Reset any existing interval
            if (window.checkDurationInterval) {
                clearInterval(window.checkDurationInterval);
            }
            
            window.checkDurationInterval = setInterval(() => {
                const duration = videoElement.duration;
                if (duration && !isNaN(duration)) {
                    clearInterval(window.checkDurationInterval);
                    const targetTime = Math.max(0, duration - remainingSeconds);
                    videoElement.currentTime = targetTime;
                    
                    chrome.storage.local.get(['autoPlay'], function(settings) {
                        if (!settings.autoPlay) {
                            videoElement.pause();
                        }
                    });
                }
            }, CONSTANTS.VIDEO_LOAD_CHECK_INTERVAL);

            setTimeout(() => {
                if (window.checkDurationInterval) {
                    clearInterval(window.checkDurationInterval);
                }
            }, CONSTANTS.VIDEO_LOAD_TIMEOUT);

        } catch (error) {
            console.error('Error setting video time:', error);
        }
    }

    // Apply user-configurable options (override some CONSTANTS)
    chrome.storage.local.get(['options'], (result) => {
        const options = result.options || {};

        if (typeof options.autoNextThreshold === 'number' && !isNaN(options.autoNextThreshold)) {
            CONSTANTS.AUTO_NEXT_THRESHOLD = options.autoNextThreshold;
        }
        if (typeof options.skipSeconds === 'number' && !isNaN(options.skipSeconds)) {
            CONSTANTS.SKIP_SECONDS = options.skipSeconds;
        }
        if (typeof options.skipOpeningSeconds === 'number' && !isNaN(options.skipOpeningSeconds)) {
            CONSTANTS.SKIP_OPENING_SECONDS = options.skipOpeningSeconds;
        }
    });

    // Update visibility change listener
    document.addEventListener('visibilitychange', () => {
        const wasVisible = isPageVisible;
        isPageVisible = document.visibilityState === 'visible';

        // If page becomes visible and was previously hidden, but only on initial load
        if (isPageVisible && !wasVisible && !hasPerformedInitialScroll) {
            performScrollAndSeek();
        }
    });

    // Update initialize function
    function initialize() {
        isInitialLoad = true;

        // Only start if page is visible
        if (document.visibilityState === 'visible') {
            scrollToSavedEpisode();
        } else {
            // Wait for page to become visible
            document.addEventListener('visibilitychange', function onVisibilityChange() {
                if (document.visibilityState === 'visible') {
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                    scrollToSavedEpisode();
                }
            });
        }

        // Delay the start of episode tracking
        setTimeout(() => {
            isInitialLoad = false;
            if (isPageVisible) {
                setInterval(findCurrentEpisode, CONSTANTS.CHECK_INTERVAL);
            }
        }, CONSTANTS.INITIAL_LOAD_DELAY);

        // Message listener for notifications
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "showNotification") {
                const animeId = getAnimeIdFromUrl();
                chrome.storage.local.get('animeData', (result) => {
                    if (result.animeData?.[animeId]) {
                        NotificationUI.showEpisodeNotification(result.animeData[animeId]);
                    }
                });
            }
        });

        // Custom keyboard handling: make right arrow skip forward by SKIP_SECONDS
        document.addEventListener("keydown", handleArrowKeySkip, true);
    }

    // Start the application
    initialize();
})();
