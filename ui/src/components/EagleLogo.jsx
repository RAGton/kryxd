import logo from '../assets/logo.png';

export default function EagleLogo({ className = "w-5 h-5" }) {
  return (
    <img 
      src={logo}
      alt="Kryonix Logo"
      className={`${className} object-contain rounded-lg scale-150`} 
    />
  );
}
