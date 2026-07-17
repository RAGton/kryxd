import React from 'react';
import { motion } from 'motion/react';

const BackgroundMosaic: React.FC = () => {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-kve-bg pointer-events-none">
      {/* Base Gradient Depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-kve-bg via-[#0a0d1a] to-[#020305]" />
      
      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-overlay opacity-[0.03] mix-blend-overlay" />
      
      {/* High-Contrast Technical Grid */}
      <div className="absolute inset-0 technical-grid" />
      
      {/* Hexagonal Grid Overlay */}
      <div className="absolute inset-0 hex-grid opacity-20" />
      
      {/* Radar Pulses from Center */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={`radar-${i}`}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-kve-accent/20"
          initial={{ width: 0, height: 0, opacity: 0 }}
          animate={{
            width: ['0vw', '150vw'],
            height: ['0vw', '150vw'],
            opacity: [0, 0.3, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            delay: i * 3.3,
            ease: "easeOut"
          }}
        />
      ))}

      {/* Large Floating Glows */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={`glow-${i}`}
          className="absolute rounded-full blur-[160px]"
          style={{
            width: Math.random() * 800 + 400,
            height: Math.random() * 800 + 400,
            background: i % 2 === 0 ? 'var(--color-kve-accent)' : 'var(--color-kve-indigo)',
            opacity: 0.18,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            x: [0, Math.random() * 250 - 125, 0],
            y: [0, Math.random() * 250 - 125, 0],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: Math.random() * 10 + 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}

      {/* Prominent Scanning Line Effect */}
      <motion.div 
        className="absolute inset-0 w-full h-[3px] bg-gradient-to-r from-transparent via-kve-accent/50 to-transparent z-10"
        animate={{
          top: ['-5%', '105%']
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "linear"
        }}
      />

      {/* Tech Particles / Bits - More numerous and dynamic */}
      {[...Array(40)].map((_, i) => (
        <motion.div
          key={`particle-${i}`}
          className={`absolute ${i % 3 === 0 ? 'w-2 h-2 rotate-45' : i % 3 === 1 ? 'w-1 h-3' : 'w-1.5 h-1.5'} bg-kve-accent/60 shadow-[0_0_10px_rgba(56,189,248,0.5)]`}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 2, 0],
            y: [0, -60, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: Math.random() * 4 + 2,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: "easeInOut"
          }}
        />
      ))}

      {/* Vertical Data Streams */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={`stream-${i}`}
          className="absolute w-[1.5px] h-48 bg-gradient-to-b from-transparent via-kve-accent/40 to-transparent"
          style={{
            left: `${Math.random() * 100}%`,
            top: '-20%',
          }}
          animate={{
            top: ['-20%', '120%'],
            opacity: [0, 0.6, 0]
          }}
          transition={{
            duration: Math.random() * 4 + 4,
            repeat: Infinity,
            delay: Math.random() * 10,
            ease: "linear"
          }}
        />
      ))}

      {/* Corner HUD Brackets */}
      <div className="absolute inset-10 border border-kve-accent/10 pointer-events-none">
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-kve-accent/40" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-kve-accent/40" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-kve-accent/40" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-kve-accent/40" />
      </div>

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,7,10,0.9)_100%)]" />
    </div>
  );
};

export default BackgroundMosaic;
