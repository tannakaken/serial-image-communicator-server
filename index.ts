import express, { Application, Request, Response } from 'express'
import { SerialPort } from 'serialport';

const sp = new SerialPort({
    path: process.argv[2],
    baudRate: 115200,
    //dataBits: 8,
    //stopBits: 1,
});
sp.on('open', () => {
    console.log("open");
});
sp.on('error', function(error) {
    console.error("serial error:", error);
});


const app: Application = express()
const PORT = 5000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, access_token'
    )
  
    // intercept OPTIONS method
    if ('OPTIONS' === req.method) {
      res.send(200)
    } else {
      next()
    }
  });
  
app.get('/', async (_req: Request, res: Response) => {
    let str = "";
    let metadataWaiting = true;
    let metadata = "";
    let imageDataWaiting = false;
    let base64String = "";
    let voltageDataWaiting = false;
    let close = false;

    const processString = (input: any, callback: (completeString: string) => void) => {
        if (close) {
            return;
        }
        str += input.toString();
        const arr = str.split(/\r\n|\n/);
        if (arr.length > 1) {
            callback(arr[0]);
            str = arr.slice(1).join("\n");
        }
    }

    sp.on('data', function(input) {
        if (metadataWaiting) {
            processString(input, (completedString) => {
                if (completedString.startsWith("image not found")) {
                    console.warn(completedString);
                    res.status(404).json({
                        message: "image not found",
                    })
                    close = true;
                    return;
                }
                if (completedString.startsWith("SpGnss E:")) {
                    console.warn(completedString);
                    return;
                }
                metadata = completedString;
                console.warn("metadata: ", metadata);
                metadataWaiting = false;
                imageDataWaiting = true;
            });
        } else if (imageDataWaiting) {
            processString(input, (completedString) => {
                console.warn("base64String: ", completedString);
                base64String = completedString;
                imageDataWaiting = false;
                voltageDataWaiting = true;
            });
        } else if (voltageDataWaiting) {
            processString(input, (completedString) => {
                const voltageData = completedString.split(",").map((str) => parseInt(str, 10)).filter((num) => !isNaN(num));
                console.warn(voltageData);
                res.status(200).json({
                    metadata: metadata,
                    image: base64String,
                });
                close = true;
                str = "";
                metadata = "";
                base64String = "";
                metadataWaiting = true;
                voltageDataWaiting = false;
            });
        }
    });

    sp.write('>', (error) => {
        if (error) {
            console.warn(error);
        } else {
            console.warn("send");
        }
    });
})

try {
    app.listen(PORT, () => {
        console.log(`dev server running at: http://localhost:${PORT}/`)
    })
} catch (e) {
    if (e instanceof Error) {
        console.error(e.message)
    }
}
