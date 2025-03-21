(function () {
    // Const
    const CONSTANTS = {
        AUTO_NEXT_THRESHOLD: 95, // seconds
        CHECK_INTERVAL: 2000,    // milliseconds
        NOTIFICATION_DURATION: 7000,
        NOTIFICATION_FADE_DURATION: 1000,
        VIDEO_LOAD_CHECK_INTERVAL: 500,
        VIDEO_LOAD_TIMEOUT: 10000
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

    /**
     * Saves the last watched episode data
     */
    function saveLastWatched(title, episode, remainingTime) {
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
     * Processes video player state and updates episode tracking
     * @param {HTMLElement} videoPlayer - The video player element
     * @param {HTMLElement} article - The parent article element
     */
    function processVideoState(videoPlayer, article) {
        const playerState = {
            isPlaying: videoPlayer.classList.contains("vjs-playing") && 
                       videoPlayer.classList.contains("vjs-has-started"),
            justPaused: videoPlayer.classList.contains("vjs-paused") && 
                        videoPlayer.classList.contains("vjs-user-active")
        };

        if (!playerState.isPlaying && !playerState.justPaused) return;

        const elements = {
            title: article.querySelector("header h2 a"),
            remainingTime: article.querySelector(".vjs-remaining-time-display")
        };

        if (!elements.title || !elements.remainingTime) return;

        const episodeInfo = parseEpisodeInfo(elements.title.textContent.trim(), 
                                           elements.remainingTime.textContent.trim());
        if (!episodeInfo) return;

        console.log(`Detected: ${episodeInfo.title} - [${episodeInfo.episode}], Remaining Time: ${episodeInfo.remainingTime}`);

        if (shouldTriggerAutoNext(episodeInfo.remainingSeconds, playerState.justPaused)) {
            handleAutoNextEpisode(episodeInfo.episode);
        }

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
     * Checks if auto-next should be triggered
     */
    function shouldTriggerAutoNext(remainingSeconds, justPaused) {
        return remainingSeconds <= CONSTANTS.AUTO_NEXT_THRESHOLD && 
               justPaused && 
               remainingSeconds !== 0;  // 0 also means video is loading
    }

    /**
     * Handles auto-next episode 
     */
    function handleAutoNextEpisode(currentEpisode) {
        chrome.storage.local.get(['autoNextEpisode'], function(settings) {
            if (!settings.autoNextEpisode) return;

            const nextEpisode = String(parseInt(currentEpisode) + 1);
            const found = findAndPlayNextEpisode(nextEpisode);
            
            NotificationUI.showTextNotification(found ? "開始下一集" : "冇下集了");
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
            if (!match || match[2] !== nextEpisode) continue;

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
        
        articles.forEach(article => {
            const videoPlayer = article.querySelector(".video-js");
            if (!videoPlayer) return;

            const debouncedCallback = debounce(
                () => processVideoState(videoPlayer, article), 
                1000
            );

            const observer = new MutationObserver(debouncedCallback);
            observer.observe(videoPlayer, { 
                attributes: true, 
                attributeFilter: ["class"] 
            });
        });
    }

    /**
     * Handles video playback and seeking to saved position
     */
    function handleVideoPlayback(videoContainer, savedData) {
        try {
            const videoElement = videoContainer.querySelector('video');
            if (!videoElement) {
                console.error('Video element not found');
                return;
            }

            const remainingParts = savedData.remainingTime.split(':');
            const remainingSeconds = parseInt(remainingParts[0]) * 60 + parseInt(remainingParts[1]);
            
            const checkDuration = setInterval(() => {
                const duration = videoElement.duration;
                if (duration && !isNaN(duration)) {
                    clearInterval(checkDuration);
                    const targetTime = Math.max(0, duration - remainingSeconds);
                    videoElement.currentTime = targetTime;
                    
                    chrome.storage.local.get(['autoPlay'], function(settings) {
                        if (!settings.autoPlay) {
                            videoElement.pause();
                        }
                    });
                }
            }, CONSTANTS.VIDEO_LOAD_CHECK_INTERVAL);

            setTimeout(() => clearInterval(checkDuration), CONSTANTS.VIDEO_LOAD_TIMEOUT);
        } catch (error) {
            console.error('Error setting video time:', error);
        }
    }

    /**
     * Scrolls to and loads the saved episode
     */
    function scrollToSavedEpisode() {
        const animeId = getAnimeIdFromUrl();
        
        chrome.storage.local.get('animeData', (result) => {
            const savedData = result.animeData?.[animeId];
            if (!savedData) return;

            const article = findEpisodeArticle(savedData.episode);
            if (!article) return;

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

    // Initialize
    function initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scrollToSavedEpisode);
        } else {
            scrollToSavedEpisode();
        }

        setInterval(findCurrentEpisode, CONSTANTS.CHECK_INTERVAL);

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
    }

    // Start the application
    initialize();
})();
