// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as path from '../../../platform/vscode-path/path';
import { SemVer } from 'semver';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { Common, DataScience } from '../../../platform/common/utils/localize';
import { IInterpreterService } from '../../../platform/interpreter/contracts';
import { PythonEnvironment } from '../../../platform/pythonEnvironments/info';
import { ProductInstaller } from '../../../platform/interpreter/installer/productInstaller.node';
import { IInstaller, Product } from '../../../platform/interpreter/installer/types';
import { DataViewerDependencyService } from '../../../webviews/extension-side/dataviewer/dataViewerDependencyService.node';
import { Uri } from 'vscode';
import { pandasMinimumVersionSupportedByVariableViewer } from '../../../webviews/extension-side/dataviewer/constants';
import { PythonExecutionFactory } from '../../../platform/interpreter/pythonExecutionFactory.node';
import { IPythonExecutionFactory, IPythonExecutionService } from '../../../platform/interpreter/types.node';
import { mockedVSCodeNamespaces, resetVSCodeMocks } from '../../../test/vscode-mock';

suite('DataViewerDependencyService (PythonEnvironment, Node)', () => {
    let dependencyService: DataViewerDependencyService;
    let pythonExecFactory: IPythonExecutionFactory;
    let installer: IInstaller;
    let interpreter: PythonEnvironment;
    let interpreterService: IInterpreterService;
    let pythonExecService: IPythonExecutionService;

    setup(async () => {
        resetVSCodeMocks();
        interpreter = {
            displayName: '',
            id: Uri.file(path.join('users', 'python', 'bin', 'python.exe')).fsPath,
            uri: Uri.file(path.join('users', 'python', 'bin', 'python.exe')),
            sysPrefix: '',
            sysVersion: '',
            version: new SemVer('3.3.3')
        };
        pythonExecService = mock<IPythonExecutionService>();
        installer = mock(ProductInstaller);
        pythonExecFactory = mock(PythonExecutionFactory);
        interpreterService = mock<IInterpreterService>();

        dependencyService = new DataViewerDependencyService(
            instance(installer),
            instance(pythonExecFactory),
            instance(interpreterService)
        );

        when(interpreterService.getActiveInterpreter()).thenResolve(interpreter);
        when(interpreterService.getActiveInterpreter(anything())).thenResolve(interpreter);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (instance(pythonExecService) as any).then = undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pythonExecService as any).then = undefined;
        when(pythonExecFactory.createActivatedEnvironment(anything())).thenResolve(instance(pythonExecService));
    });
    teardown(() => resetVSCodeMocks());
    test('All ok, if pandas is installed and version is > 1.20', async () => {
        when(
            pythonExecService.exec(
                deepEqual([
                    '-c',
                    'import pandas;print(pandas.__version__);print("5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d")'
                ]),
                anything()
            )
        ).thenResolve({ stdout: '0.30.0\n5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d' });
        await dependencyService.checkAndInstallMissingDependencies(interpreter);
    });
    test('Throw exception if pandas is installed and version is = 0.20', async () => {
        when(
            pythonExecService.exec(
                deepEqual([
                    '-c',
                    'import pandas;print(pandas.__version__);print("5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d")'
                ]),
                anything()
            )
        ).thenResolve({ stdout: '0.20.0\n5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d' });

        const promise = dependencyService.checkAndInstallMissingDependencies(interpreter);

        await assert.isRejected(
            promise,
            DataScience.pandasTooOldForViewingFormat('0.20.', pandasMinimumVersionSupportedByVariableViewer)
        );
    });
    test('Throw exception if pandas is installed and version is < 0.20', async () => {
        when(
            pythonExecService.exec(
                deepEqual([
                    '-c',
                    'import pandas;print(pandas.__version__);print("5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d")'
                ]),
                anything()
            )
        ).thenResolve({ stdout: '0.10.0\n5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d' });

        const promise = dependencyService.checkAndInstallMissingDependencies(interpreter);

        await assert.isRejected(
            promise,
            DataScience.pandasTooOldForViewingFormat('0.10.', pandasMinimumVersionSupportedByVariableViewer)
        );
    });
    test('Prompt to install pandas and install pandas', async () => {
        when(
            pythonExecService.exec(
                deepEqual([
                    '-c',
                    'import pandas;print(pandas.__version__);print("5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d")'
                ]),
                anything()
            )
        ).thenReject(new Error('Not Found'));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(mockedVSCodeNamespaces.window.showErrorMessage(anything(), anything(), anything())).thenResolve(
            Common.install as any
        );
        when(installer.install(Product.pandas, interpreter, anything())).thenResolve();

        await dependencyService.checkAndInstallMissingDependencies(interpreter);

        verify(
            mockedVSCodeNamespaces.window.showErrorMessage(
                DataScience.pandasRequiredForViewing(pandasMinimumVersionSupportedByVariableViewer),
                deepEqual({ modal: true }),
                Common.install
            )
        ).once();
        verify(installer.install(Product.pandas, interpreter, anything())).once();
    });
    test('Prompt to install pandas and throw error if user does not install pandas', async () => {
        when(
            pythonExecService.exec(
                deepEqual([
                    '-c',
                    'import pandas;print(pandas.__version__);print("5dc3a68c-e34e-4080-9c3e-2a532b2ccb4d")'
                ]),
                anything()
            )
        ).thenReject(new Error('Not Found'));
        when(mockedVSCodeNamespaces.window.showErrorMessage(anything(), anything(), anything())).thenResolve();

        const promise = dependencyService.checkAndInstallMissingDependencies(interpreter);

        await assert.isRejected(
            promise,
            DataScience.pandasRequiredForViewing(pandasMinimumVersionSupportedByVariableViewer)
        );
        verify(
            mockedVSCodeNamespaces.window.showErrorMessage(
                DataScience.pandasRequiredForViewing(pandasMinimumVersionSupportedByVariableViewer),
                deepEqual({ modal: true }),
                Common.install
            )
        ).once();
        verify(installer.install(anything(), anything(), anything())).never();
    });
});
