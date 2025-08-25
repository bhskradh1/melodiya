# Troubleshooting Guide - Black Screen Issue

## Problem Description
When trying to play songs on a new device, a black screen appears instead of the music player.

**NEW: Mobile-specific issue**: On mobile devices, the black screen appears specifically when notification permissions are allowed, but not on desktop.

## Root Causes
The black screen issue is typically caused by:
1. **YouTube IFrame API loading failures** - The YouTube player API fails to load properly
2. **Browser compatibility issues** - Old browsers or restricted environments
3. **Network connectivity problems** - Firewall or network restrictions blocking YouTube
4. **Player initialization timing** - Player tries to play before fully ready
5. **Cross-origin restrictions** - Security policies blocking external content
6. **Mobile notification conflicts** - Notification permissions interfering with YouTube player on mobile devices

## Recent Fixes Applied

### 1. Improved YouTube Player Initialization
- Added better error handling and retry mechanisms
- Increased timeout from 10 to 15 seconds for slower connections
- Added browser compatibility checks
- Added network connectivity verification

### 2. Enhanced Error Handling
- Specific error messages for different failure types
- Automatic retry logic for recoverable errors
- User-friendly error display with retry buttons
- Fallback mechanisms when player fails

### 3. Better State Management
- Player ready state tracking
- Loading indicators during initialization
- Proper cleanup and error recovery

### 4. Mobile-Specific Fixes (NEW)
- **Delayed notification display** on mobile to prevent player interference
- **Mobile-optimized service worker registration** with delayed initialization
- **Mobile-specific YouTube player settings** for better compatibility
- **Background sync disabled on mobile** to prevent conflicts
- **Notification permission requests delayed** until player is ready on mobile

## Troubleshooting Steps

### Step 1: Check Browser Console
1. Open Developer Tools (F12 or right-click → Inspect)
2. Go to Console tab
3. Look for error messages related to YouTube or player
4. Check for network errors or blocked requests
5. **Mobile**: Look for notification-related errors

### Step 2: Verify Browser Compatibility
- Use modern browsers: Chrome, Firefox, Edge, Safari
- Ensure JavaScript is enabled
- Check if any browser extensions are blocking content

### Step 3: Check Network/Firewall
- Ensure YouTube.com is accessible
- Check if corporate firewall blocks YouTube
- Try on different network (mobile hotspot, home WiFi)

### Step 4: Clear Browser Data
- Clear cookies and cache
- Clear site data for the app
- Try incognito/private browsing mode

### Step 5: Reload and Retry
- Use the "Retry" button in the error message
- Refresh the page completely (Ctrl+F5 or Cmd+Shift+R)
- Wait for the "Initializing player..." message to complete

### Step 6: Mobile-Specific Troubleshooting (NEW)
- **Notification permissions**: Try denying notification permissions temporarily
- **Service worker**: Clear site data to reset service worker
- **Mobile browser**: Try using Chrome or Safari instead of in-app browsers
- **Device restart**: Restart the mobile device to clear any cached issues

## Error Messages and Solutions

### "Failed to load YouTube player - check internet connection"
- **Solution**: Check internet connection and firewall settings
- **Action**: Try refreshing the page or switching networks

### "YouTube player loading timeout - please refresh the page"
- **Solution**: Slow connection or blocked requests
- **Action**: Wait longer or check network restrictions

### "HTML5 player error - try refreshing the page"
- **Solution**: Browser compatibility issue
- **Action**: Update browser or try different browser

### "Video not found or removed"
- **Solution**: YouTube video is unavailable
- **Action**: Try a different song

### "Maximum retry attempts reached. Please refresh the page"
- **Solution**: Player failed to initialize after multiple attempts
- **Action**: Refresh the page completely

### Mobile-specific: "Player error (5) - please try again"
- **Solution**: HTML5 player error on mobile, often related to notifications
- **Action**: Deny notification permissions temporarily, then retry

## Prevention Tips

1. **Use modern browsers** - Chrome, Firefox, Edge, Safari
2. **Enable JavaScript** - Required for YouTube player
3. **Check network access** - Ensure YouTube.com is accessible
4. **Clear browser data** - Regularly clear cache and cookies
5. **Update browser** - Keep browser updated to latest version
6. **Mobile notifications** - Be cautious with notification permissions on mobile
7. **Service worker** - Clear site data if experiencing mobile issues

## Technical Details

The app uses the YouTube IFrame API to play music. The black screen occurs when:
- The API fails to load from YouTube servers
- The player fails to initialize properly
- Network requests are blocked or timeout
- Browser security policies prevent content loading
- **Mobile**: Notification permissions interfere with player initialization
- **Mobile**: Service worker registration conflicts with media playback

## Mobile-Specific Technical Details

On mobile devices, the black screen issue is often caused by:
1. **Notification API conflicts** - Requesting notification permissions too early
2. **Service worker timing** - Service worker registration interfering with player
3. **Background sync conflicts** - Background sync requests blocking media playback
4. **Mobile browser restrictions** - Stricter security policies on mobile browsers

## Support

If the issue persists after trying all troubleshooting steps:
1. Check the browser console for specific error messages
2. Note your browser version and operating system
3. Try on a different device or network
4. **Mobile users**: Note if the issue occurs with or without notification permissions
5. Contact support with detailed error information

## Recent Updates

- **v1.1**: Added comprehensive error handling and retry mechanisms
- **v1.1**: Improved player initialization and state management
- **v1.1**: Added browser compatibility checks
- **v1.1**: Enhanced user feedback and error messages
- **v1.2**: Fixed mobile-specific black screen issue with notification permissions
- **v1.2**: Added mobile-optimized service worker and notification handling
- **v1.2**: Improved mobile YouTube player compatibility
