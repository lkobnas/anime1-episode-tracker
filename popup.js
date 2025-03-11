document.addEventListener("DOMContentLoaded", function () {
    chrome.storage.local.get("lastWatched", (data) => {
        let animeTitle = document.getElementById("animeTitle");
        let episodeNumber = document.getElementById("episodeNumber");
        let remainingTime = document.getElementById("remainingTime");

        if(animeTitle != null && episodeNumber != null && remainingTime != null) {
            if (data.lastWatched) {
                animeTitle.textContent = data.lastWatched.title || "Unknown";
                episodeNumber.textContent = data.lastWatched.episode || "Unknown";
                remainingTime.textContent = data.lastWatched.remainingTime || "Unknown";
            } else {
                animeTitle.textContent = "No data";
                episodeNumber.textContent = "No data";
                remainingTime.textContent = "No data";
            }
        }
    });
});
