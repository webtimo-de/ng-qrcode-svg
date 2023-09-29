import { OnChanges, SimpleChanges } from '@angular/core';
import * as i0 from "@angular/core";
export declare class QrcodeSvgComponent implements OnChanges {
    value: string;
    ecl: 'low' | 'medium' | 'quartile' | 'high';
    borderSize: number;
    size: string | number;
    backgroundColor: string;
    foregroundColor: string;
    alt: string | undefined;
    ariaLabel: string | undefined;
    private qr;
    viewBox: string;
    d: string;
    ngOnChanges(changes: SimpleChanges): void;
    private validateInputs;
    private skipUpdate;
    private createD;
    static ɵfac: i0.ɵɵFactoryDeclaration<QrcodeSvgComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<QrcodeSvgComponent, "qrcode-svg", never, { "value": { "alias": "value"; "required": false; }; "ecl": { "alias": "ecl"; "required": false; }; "borderSize": { "alias": "borderSize"; "required": false; }; "size": { "alias": "size"; "required": false; }; "backgroundColor": { "alias": "backgroundColor"; "required": false; }; "foregroundColor": { "alias": "foregroundColor"; "required": false; }; "alt": { "alias": "alt"; "required": false; }; "ariaLabel": { "alias": "ariaLabel"; "required": false; }; }, {}, never, never, false, never>;
}
