import React, { useState, useEffect } from 'react';
import { useSceneContext } from '@/contexts/SceneContext';
import {
  loadSceneSettings,
  onSettingsChange,
} from '@/utils/sceneSettingsStore';
import { getInteractiveRoomImageStyles } from '@/utils/interactiveRoomLayout';

/**
 * Static background image component for scene display
 * Fills the left 2/3 of the screen with location-based images or mood-based generated images
 * Default: front_door.jpg (entering Milla's world)
 */
export function BackgroundLayer() {
  const { location } = useSceneContext();
  const [imageSrc, setImageSrc] = useState<string>(
    '/assets/scenes/front_door-night.jpg'
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [usingMoodBackground, setUsingMoodBackground] = useState(false);
  const [settings, setSettings] = useState(loadSceneSettings);

  useEffect(() => onSettingsChange(setSettings), []);

  // Listen for mood background updates
  useEffect(() => {
    const handleMoodBackgroundUpdate = (event: CustomEvent) => {
      const { imageUrl } = event.detail;
      if (imageUrl) {
        setImageLoaded(false);
        setImageSrc(imageUrl);
        setUsingMoodBackground(true);
      }
    };

    window.addEventListener(
      'moodBackgroundUpdated',
      handleMoodBackgroundUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        'moodBackgroundUpdated',
        handleMoodBackgroundUpdate as EventListener
      );
    };
  }, []);

  useEffect(() => {
    // If using mood background, don't change on location updates
    if (usingMoodBackground) {
      return;
    }

    // Map location to image path - using actual filenames from /client/public/assets/scenes/
    const locationImageMap: Record<string, string> = {
      front_door: '/assets/scenes/front_door-night.jpg',
      living_room: '/assets/scenes/living_room-night.jpg',
      bedroom: '/assets/scenes/bedroom-night.jpg',
      bathroom: '/assets/scenes/living_room-night.jpg', // Fallback to living room
      kitchen: '/assets/scenes/living_room-night.jpg', // Fallback to living room
      outdoor: '/assets/scenes/front_door-night.jpg', // Fallback to front door
      dining_room: '/assets/scenes/living_room-night.jpg', // Fallback to living room
      workspace: '/assets/scenes/living_room-night.jpg', // Fallback to living room
      guest_room: '/assets/scenes/living_room-night.jpg', // Fallback to living room
    };

    const newImageSrc =
      locationImageMap[location] || '/assets/scenes/front_door-night.jpg';
    setImageLoaded(false);
    setImageSrc(newImageSrc);
  }, [location, usingMoodBackground]);

  const isBedroomPeek =
    location === 'bedroom' &&
    !usingMoodBackground &&
    (settings.interactiveRoomEnabled ?? true);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden',
        background: isBedroomPeek
          ? 'radial-gradient(ellipse at 50% 80%, rgba(60, 20, 90, 0.5), rgba(8, 2, 18, 0.95))'
          : undefined,
      }}
    >
      <img
        src={imageSrc}
        alt=""
        onLoad={() => setImageLoaded(true)}
        style={{
          ...(isBedroomPeek
            ? getInteractiveRoomImageStyles(settings)
            : {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                transition: 'opacity 0.5s ease-in-out',
              }),
          opacity: imageLoaded ? 1 : 0,
        }}
      />
    </div>
  );
}
