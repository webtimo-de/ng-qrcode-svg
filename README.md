# ng-qrcode-svg

[![npm-version](https://img.shields.io/npm/v/ng-qrcode-svg.svg?label=npm)](https://www.npmjs.com/package/ng-qrcode-svg)
![npm](https://img.shields.io/npm/dw/ng-qrcode-svg)
[![license](https://img.shields.io/npm/l/ng-qrcode-svg.svg)](https://github.com/webtimo-de/ng-qrcode-svg/blob/master/LICENSE)

### Simple QR code generator (SVG only) for Angular

## Installation

```bash
npm install ng-qrcode-svg
```

## Usage

1. Import module `QrcodeSvgModule`

```ts
import {NgModule} from '@angular/core';
import {QrcodeSvgModule} from 'ng-qrcode-svg';

@NgModule({
    imports: [
        QrcodeSvgModule // import QrcodeSvgModule
    ]
})
export class MyModule {
}
```

2. Use the `qrcode-svg` component which will render a QR code in SVG format

```html
<qrcode-svg value="hello world!"></qrcode-svg>
```

## Component Properties

| Name                                                    | Description                                               | Default   |
|---------------------------------------------------------|-----------------------------------------------------------|-----------|
| @Input() value: string                                  | The value which need to be encoded                        | undefined |
| @Input() ecl: 'low' \| 'medium' \| 'quartile' \| 'high' | Error correction level                                    | medium    |
| @Input() borderSize: number                             | The padding between the edge and the QR code (quiet zone) | 2         |
| @Input() size: string \| number                         | The size of the QR code SVG (css format)                  | 250px     |
| @Input() backgroundColor: string                        | The 'path' color (background)                             | #FFFFFF   |
| @Input() foregroundColor: string                        | The 'rect' color (foreground)                             | #000000   |
| @Input() alt: string \| undefined                       | HTML alt attribute                                        | undefined |
| @Input() ariaLabel: string \| undefined                 | HTML aria-label attribute                                 | undefined |


---
## @larscom/ng-qrcode-svg

This is a renewed variant of the [@larscom/ng-qrcode-svg](https://github.com/larscom/ng-qrcode-svg). This runs on
Angular 16 and Ivy. I personally use the library, and it is therefore regularly maintained.


You can find more information in the original project:
[github.com/larscom/ng-qrcode-svg](https://github.com/larscom/ng-qrcode-svg/blob/master/README.md)
