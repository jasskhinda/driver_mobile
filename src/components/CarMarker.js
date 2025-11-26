import React from 'react';
import Svg, { Path, G, Rect } from 'react-native-svg';

/**
 * Professional car marker for maps with brand color
 * Top-down view of a car that rotates based on heading
 */
export default function CarMarker({ size = 50, color = '#5fbfc0' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <G>
        {/* White background/shadow */}
        <Path
          d="M20 7 L27 11 L27 29 L20 33 L13 29 L13 11 Z"
          fill="#fff"
          opacity="0.9"
        />

        {/* Car body - brand color */}
        <Path
          d="M20 8 L26 12 L26 28 L20 32 L14 28 L14 12 Z"
          fill={color}
          stroke="#fff"
          strokeWidth="1.5"
        />

        {/* Front windshield - darker */}
        <Path
          d="M18 10 L22 10 L23 13 L17 13 Z"
          fill="#2d4a4d"
          opacity="0.6"
        />

        {/* Rear windshield - darker */}
        <Path
          d="M18 30 L22 30 L23 27 L17 27 Z"
          fill="#2d4a4d"
          opacity="0.6"
        />

        {/* Left side window */}
        <Path
          d="M14.5 16 L14.5 24 L16 25 L16 15 Z"
          fill="#2d4a4d"
          opacity="0.5"
        />

        {/* Right side window */}
        <Path
          d="M25.5 16 L25.5 24 L24 25 L24 15 Z"
          fill="#2d4a4d"
          opacity="0.5"
        />

        {/* Center highlight for depth */}
        <Path
          d="M18.5 15 L21.5 15 L21.5 25 L18.5 25 Z"
          fill="#fff"
          opacity="0.2"
        />
      </G>
    </Svg>
  );
}
