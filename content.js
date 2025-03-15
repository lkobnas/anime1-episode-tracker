(function () {
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

    let lastSaved = { title: "", episode: "", remainingTime: "" };
    
    function saveLastWatched(title, episode, remainingTime) {

        if (lastSaved.title === title && lastSaved.episode === episode && lastSaved.remainingTime === remainingTime) {
            return; // Avoid duplicate saves
        }
        lastSaved = { title, episode, remainingTime };

        // Get the anime identifier from the URL path
        const urlPath = window.location.pathname;
        const animeId = urlPath.split('/').filter(segment => segment).pop();

        // First, get existing data
        chrome.storage.local.get('animeData', (result) => {
            let animeData = result.animeData || {};
            
            // Update or add new entry for this specific anime
            animeData[animeId] = {
                title,
                episode,
                remainingTime,
                lastUpdated: Date.now()
            };

            // Save back to storage
            chrome.storage.local.set({ animeData }, () => {
                console.log(`Saved: ${title} - [${episode}], Remaining Time: ${remainingTime}`);
            });
        });
    }

    function findCurrentEpisode() {

        let articles = document.querySelectorAll("article");

        let titleElement = null;
        let remainingTimeElement = null;
        
        articles.forEach(article => {
            let videoPlayer = article.querySelector(".video-js");
            if (!videoPlayer) return;
    
            let debouncedCallback = debounce(() => {
                let isPlaying = (videoPlayer.classList.contains("vjs-playing") && videoPlayer.classList.contains("vjs-has-started"));
                let justPaused = videoPlayer.classList.contains("vjs-paused") && videoPlayer.classList.contains("vjs-user-active");

                if (isPlaying || justPaused) {
                    titleElement = article.querySelector("header h2 a");
                    console.log(titleElement.textContent);
                    remainingTimeElement = article.querySelector(".vjs-remaining-time-display");
    
                    if (titleElement) {
                        let titleText = titleElement.textContent.trim();
                        let match = titleText.match(/(.+?)\s*\[(\d+)\]/);
                        let remainingTime = remainingTimeElement.textContent.trim();
            
                        if (match) {
                            let title = match[1];
                            let episode = match[2];
            
                            console.log(`Detected: ${title} - [${episode}], Remaining Time: ${remainingTime}`);

                            // Convert remaining time (M:SS format) to seconds
                            const remainingParts = remainingTime.split(':');
                            const remainingSeconds = parseInt(remainingParts[0]) * 60 + parseInt(remainingParts[1]);

                            // Handle auto next episode
                            if (remainingSeconds <= 95 && justPaused) { // 1:35 in seconds
                                chrome.storage.local.get(['autoNextEpisode'], function(settings) {
                                    if (settings.autoNextEpisode) {
                                        nextEpisode = String(parseInt(episode) + 1);
                                        const articles = document.querySelectorAll("article");
                                        let found = false;
                                        articles.forEach(article => {

                                            const titleElement = article.querySelector("header h2 a");

                                            if (!titleElement) return;
                                            const match = titleElement.textContent.trim().match(/(.+?)\s*\[(\d+)\]/);

                                            if (match && match[2] === nextEpisode) {
                                                console.log(`Auto next episode found: ${nextEpisode}`);
                                                article.scrollIntoView({ behavior: 'smooth', block: 'center' });

                                                // Find and click the video player
                                                const videoContainer = article.querySelector(".video-js");
                                                if (videoContainer) {
                                                    // Click to start loading the video
                                                    videoContainer.click();
                                                    // showNotificationText("播放下一集");
                                                    // found = true;
                                                    return;
                                                }
                                            // } else if (!found) {
                                            //     showNotificationText("已經冇下集了");
                                            }
                                            
                                        });                                        
                                    }
                                });
                            }
                            
                            saveLastWatched(title, episode, remainingTime);
                        }
                    }
                }


            }, 1000); 
    
            let observer = new MutationObserver(debouncedCallback);
            observer.observe(videoPlayer, { attributes: true, attributeFilter: ["class"] });
        });

    }

    function scrollToSavedEpisode() {
        const urlPath = window.location.pathname;
        const animeId = urlPath.split('/').filter(segment => segment).pop();

        chrome.storage.local.get('animeData', (result) => {
            if (!result.animeData || !result.animeData[animeId]) return;

            const savedData = result.animeData[animeId];
            const savedEpisode = savedData.episode;
            const savedRemainingTime = savedData.remainingTime;
            if (savedRemainingTime < 95) {
                
            }

            // Find the episode link that matches our saved episode
            const articles = document.querySelectorAll("article");
            articles.forEach(article => {
                const titleElement = article.querySelector("header h2 a");
                if (!titleElement) return;

                const match = titleElement.textContent.trim().match(/(.+?)\s*\[(\d+)\]/);
                if (match && match[2] === savedEpisode) {
                    // Smooth scroll to the element
                    article.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Show a notification popup
                    showNotification(savedData);

                    // Find and click the video player
                    const videoContainer = article.querySelector(".video-js");
                    if (videoContainer) {
                        // Click to start loading the video
                        videoContainer.click();

                        try {
                            const videoElement = videoContainer.querySelector('video');
                            if (!videoElement) {
                                console.error('Video element not found');
                                return;
                            }

                            // Convert remaining time to seconds
                            const remainingParts = savedData.remainingTime.split(':');
                            const remainingSeconds = parseInt(remainingParts[0]) * 60 + parseInt(remainingParts[1]);
                            
                            // Wait for duration to be available
                            const checkDuration = setInterval(() => {
                                const duration = videoElement.duration;
                                if (duration && !isNaN(duration)) {
                                    clearInterval(checkDuration);
                                    
                                    // Calculate the target time
                                    const targetTime = Math.max(0, duration - remainingSeconds);
                                    
                                    // Set the video time
                                    videoElement.currentTime = targetTime;

                                    console.log(`Seeking to ${targetTime} seconds (${duration} - ${remainingSeconds})`);
                                    
                                    // Check autoPlay setting before pausing
                                    chrome.storage.local.get(['autoPlay'], function(settings) {
                                        if (!settings.autoPlay) {
                                            videoElement.pause();
                                        }
                                    });

                                }
                            }, 500); // Check every 500ms

                            // Stop checking after 10 seconds to prevent infinite loop
                            setTimeout(() => {
                                clearInterval(checkDuration);
                            }, 10000);

                        } catch (error) {
                            console.error('Error setting video time:', error);
                        }
                    }
                }
            });
        });
    }

    function showNotification(savedData) {
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

        notification.innerHTML = `
            <div style="margin-bottom: 8px"><strong>你上次睇到:</strong></div>
            <div>第 ${savedData.episode} 集 </div>
            <div>剩返 ${savedData.remainingTime}</div>
        `;

        document.body.appendChild(notification);

        // Remove the notification after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => notification.remove(), 1000);
        }, 7000);
    }

    function showNotificationText(text) {
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

        notification.innerHTML = `
            <div style="margin-bottom: 8px"><strong>${text}</strong></div>
        `;

        document.body.appendChild(notification);

        // Remove the notification after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }

    // Call scrollToSavedEpisode when the page loads
    // Wait for the content to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scrollToSavedEpisode);
    } else {
        scrollToSavedEpisode();
    }

    // Run every 2 seconds to check which episode is being watched
    setInterval(findCurrentEpisode, 2000);

    // Add this message listener near the top of your IIFE
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "showNotification") {
            const urlPath = window.location.pathname;
            const animeId = urlPath.split('/').filter(segment => segment).pop();

            chrome.storage.local.get('animeData', (result) => {
                if (result.animeData && result.animeData[animeId]) {
                    showNotification(result.animeData[animeId]);
                }
            });
        }
    });

})();
