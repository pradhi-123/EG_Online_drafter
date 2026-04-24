import { useState, useEffect, useRef } from 'react';

export interface SensorData {
  time: string;
  co2: number;
  humidity: number;
  microbialSymptoms: number;
}

export function useMockData() {
  const [data, setData] = useState<SensorData[]>([]);
  const [currentHumidity, setCurrentHumidity] = useState(10);
  const [currentCo2, setCurrentCo2] = useState(400);
  const [currentMicrobial, setCurrentMicrobial] = useState(0);
  const [fanStatus, setFanStatus] = useState(false);
  const [spoilageRisk, setSpoilageRisk] = useState(5);
  const [alerts, setAlerts] = useState<string[]>([]);

  const fanStatusRef = useRef(false);
  useEffect(() => { fanStatusRef.current = fanStatus; }, [fanStatus]);

  useEffect(() => {
    const initialData: SensorData[] = Array.from({ length: 20 }).map((_, i) => {
      const d = new Date();
      d.setSeconds(d.getSeconds() - (20 - i) * 2);
      return {
        time: d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' }),
        co2: 400,
        humidity: 10,
        microbialSymptoms: 0
      };
    });
    setData(initialData);

    let hum = 10;
    let co2 = 400;

    const interval = setInterval(() => {
      hum = hum + (Math.random() * 1.5 - 0.2); // Trending upwards gently
      co2 = co2 + (Math.random() * 20 - 5);
      
      if (hum < 0) hum = 0;
      if (hum > 100) hum = 100;

      const mic = Math.max(0, (hum - 10) * 1.5 + (Math.random() * 2));

      setCurrentHumidity(hum);
      setCurrentCo2(co2);
      setCurrentMicrobial(mic);

      if (hum > 12 && !fanStatusRef.current) {
        setFanStatus(true);
        fanStatusRef.current = true;
        setAlerts(prev => [...prev, `[${new Date().toLocaleTimeString()}] ALERT: Humidity exceeded 12%. Fan activated automatically.`]);
      }

      let risk = 5;
      if (hum > 12) risk += 30;
      if (hum > 15) risk += 30;
      if (co2 > 600) risk += 20;
      risk += mic * 2;
      const finalRisk = Math.min(100, Math.max(0, Math.round(risk)));
      setSpoilageRisk(finalRisk);

      setData(prev => {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
        const newPoint = { 
          time: timeString, 
          co2: Math.round(co2), 
          humidity: Number(hum.toFixed(1)), 
          microbialSymptoms: Number(mic.toFixed(1)) 
        };
        const newData = [...prev, newPoint];
        if (newData.length > 20) newData.shift();
        return newData;
      });

    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const dismissAlert = (index: number) => {
    setAlerts(prev => prev.filter((_, i) => i !== index));
  };

  return { data, currentHumidity, currentCo2, currentMicrobial, fanStatus, setFanStatus, spoilageRisk, alerts, dismissAlert };
}
