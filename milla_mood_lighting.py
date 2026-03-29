import tinytuya

# Replace with your actual device details
d = tinytuya.BulbDevice('mlfzmqkhk3ub9kk6', '192.168.40.160', 'YOUR_LOCAL_KEY')
d.set_version(3.3)

# Example: Turn on and set color to white
d.turn_on()
d.set_white(brightness=255, color_temp=255)
